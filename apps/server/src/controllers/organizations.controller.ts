import type { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { generateInviteToken, inviteExpiresAt, getMembership, type OrgRole } from '../lib/organizations.js';
import { sendNotification } from '../services/notification.service.js';
import { sendOrganizationInviteEmail } from '../lib/mail.js';
import { SLA_OVERDUE_HOURS, ELIGIBLE_LEAD_ROLES, assignLead } from '../lib/leads.js';

// ─── CRIAR ORGANIZAÇÃO (requer auth + conta Imobiliária + ainda não pertencer a uma) ─────────

/**
 * Opt-in explícito: só cria uma `Organization` quando o próprio dono de uma conta AGENCY pede.
 * Contas AGENCY existentes (Fase A) não são migradas automaticamente. Quem cria vira `OWNER` —
 * `OrganizationMember.userId` é único, então um usuário nunca pertence a mais de uma organização
 * simultaneamente (documentado como escolha de V1 em docs/crm-b2b-organizacoes-leads.md).
 */
export async function createOrganization(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const { id: userId } = request.user as { id: string };

  const owner = await prisma.user.findUnique({
    where: { id: userId },
    select: { accountType: true },
  });
  if (!owner || owner.accountType !== 'AGENCY') {
    return reply.status(403).send({ error: 'Criar uma organização é exclusivo para contas Imobiliária.' });
  }

  const existingMembership = await getMembership(userId);
  if (existingMembership) {
    return reply.status(409).send({ error: 'Você já pertence a uma organização.' });
  }

  const schema = z.object({
    name: z.string().trim().min(1, 'Nome da organização é obrigatório'),
    document: z.string().trim().min(1, 'CNPJ é obrigatório'),
  });

  const parsed = schema.safeParse(request.body);
  if (!parsed.success) return reply.status(400).send({ error: parsed.error.errors });

  const organization = await prisma.organization.create({
    data: {
      name: parsed.data.name,
      document: parsed.data.document,
      members: {
        create: { userId, role: 'OWNER' },
      },
    },
    include: { members: true },
  });

  return reply.status(201).send(organization);
}

// ─── MINHA ORGANIZAÇÃO (requer auth) ─────────────────────────────────────────

export async function getMyOrganization(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const { id: userId } = request.user as { id: string };

  const membership = await prisma.organizationMember.findUnique({
    where: { userId },
    include: {
      organization: {
        include: {
          members: {
            where: { status: 'ACTIVE' },
            include: { user: { select: { id: true, name: true, email: true, avatar: true } } },
          },
        },
      },
    },
  });

  // Um membro removido (INACTIVE, ver `removeMember`) mantém a linha por integridade do
  // histórico de CRM, mas não deve mais enxergar a organização por aqui — mesmo tratamento de
  // "não pertence a nenhuma" que alguém que nunca entrou recebe.
  if (membership && membership.status !== 'ACTIVE') {
    return reply.status(404).send({ error: 'Você não pertence a nenhuma organização.' });
  }

  if (!membership) {
    // Para contas AGENCY que já preencheram CNPJ no cadastro (Fase A "de verdade"), auto-inicializa
    // a organização com esses dados. Checar `document` (não só `accountType`) evita criar uma
    // organização fantasma para alguém que só virou AGENCY por ter aceitado um convite (ver
    // `acceptInvite`) e depois foi removido da equipe — essa pessoa nunca preencheu CNPJ/nome de
    // empresa próprios, então não deve "herdar" uma organização ao revisitar esta rota.
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (user && user.accountType === 'AGENCY' && user.document) {
      const organization = await prisma.organization.create({
        data: {
          name: user.companyName || user.name,
          document: user.document || '00000000000000',
          members: {
            create: { userId, role: 'OWNER' },
          },
        },
        include: {
          members: {
            include: { user: { select: { id: true, name: true, email: true, avatar: true } } },
          },
        },
      });
      return reply.send({ role: 'OWNER', organization });
    }

    return reply.status(404).send({ error: 'Você não pertence a nenhuma organização.' });
  }

  return reply.send({ role: membership.role, organization: membership.organization });
}

// ─── CONVITES (caminho único: sempre OrganizationInvite → aceito → OrganizationMember) ───────

const INVITABLE_ROLES = ['ADMIN', 'MANAGER', 'BROKER', 'ASSISTANT'] as const; // OWNER não é convidável (só 1 por org, na criação)

/**
 * `OWNER`/`ADMIN` convida por e-mail. Sempre cria um `OrganizationInvite`, exista ou não o `User`
 * ainda — nunca cria um `OrganizationMember` "meio existente" antes do aceite (decisão revisada
 * pelo usuário em 2026-08-30, ver docs/crm-b2b-organizacoes-leads.md).
 */
export async function inviteMember(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const membership = (request as FastifyRequest & { orgMembership: { organizationId: string } }).orgMembership;

  const schema = z.object({
    email: z.string().trim().email('E-mail inválido'),
    role: z.enum(INVITABLE_ROLES),
  });
  const parsed = schema.safeParse(request.body);
  if (!parsed.success) return reply.status(400).send({ error: parsed.error.errors });

  const email = parsed.data.email.toLowerCase();

  const targetUser = await prisma.user.findUnique({ where: { email } });
  if (targetUser) {
    const targetMembership = await getMembership(targetUser.id);
    if (targetMembership) {
      return reply.status(409).send({
        error: targetMembership.organizationId === membership.organizationId
          ? 'Esse usuário já é membro da sua organização.'
          : 'Esse usuário já pertence a outra organização.',
      });
    }
  }

  const pendingInvite = await prisma.organizationInvite.findFirst({
    where: {
      organizationId: membership.organizationId,
      email,
      acceptedAt: null,
      expiresAt: { gt: new Date() },
    },
  });
  if (pendingInvite) {
    return reply.status(409).send({ error: 'Já existe um convite pendente para esse e-mail.' });
  }

  const { id: userId } = request.user as { id: string };
  const organization = await prisma.organization.findUnique({ where: { id: membership.organizationId } });

  const invite = await prisma.organizationInvite.create({
    data: {
      organizationId: membership.organizationId,
      email,
      role: parsed.data.role,
      invitedBy: userId,
      token: generateInviteToken(),
      expiresAt: inviteExpiresAt(),
    },
  });

  if (targetUser && organization) {
    await sendNotification({
      userId: targetUser.id,
      title: 'Convite para organização',
      message: `Você foi convidado para ${organization.name} no Zhivago.`,
      type: 'INFO',
    });
  }

  if (organization) {
    sendOrganizationInviteEmail(email, organization.name, parsed.data.role, invite.token).catch((err) =>
      console.error('Falha ao enviar e-mail de convite de organização:', err)
    );
  }

  return reply.status(201).send({ id: invite.id, email: invite.email, role: invite.role, expiresAt: invite.expiresAt });
}

// ─── MEUS CONVITES PENDENTES (requer auth — filtra pelo e-mail do usuário logado) ────────────

export async function listMyInvites(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const { email } = request.user as { email: string };

  const invites = await prisma.organizationInvite.findMany({
    where: { email: email.toLowerCase(), acceptedAt: null, expiresAt: { gt: new Date() } },
    include: { organization: { select: { id: true, name: true, logo: true } } },
    orderBy: { createdAt: 'desc' },
  });

  return reply.send(invites);
}

// ─── LISTAR CONVITES PENDENTES DA ORGANIZAÇÃO (requer OWNER/ADMIN) ───────────────────────────

export async function listOrganizationInvites(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const membership = (request as FastifyRequest & { orgMembership: { organizationId: string } }).orgMembership;

  // Nunca expõe o `token` aqui — quem gerencia a organização não precisa dele (o "cancelar" usa
  // `id`), e o token é a credencial de aceite de outra pessoa.
  const invites = await prisma.organizationInvite.findMany({
    where: { organizationId: membership.organizationId, acceptedAt: null, expiresAt: { gt: new Date() } },
    select: { id: true, email: true, role: true, invitedBy: true, expiresAt: true, createdAt: true, organizationId: true },
    orderBy: { createdAt: 'desc' },
  });

  return reply.send(invites);
}

// ─── ACEITAR CONVITE (requer auth + e-mail do usuário bater com o do convite) ────────────────

export async function acceptInvite(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const { id: userId, email } = request.user as { id: string; email: string };
  const { token } = request.params as { token: string };

  const invite = await prisma.organizationInvite.findUnique({ where: { token } });
  if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) {
    return reply.status(404).send({ error: 'Convite inválido ou expirado.' });
  }
  if (invite.email !== email.toLowerCase()) {
    return reply.status(403).send({ error: 'Este convite não pertence à sua conta.' });
  }

  const existingMembership = await getMembership(userId);
  if (existingMembership) {
    return reply.status(409).send({ error: 'Você já pertence a uma organização.' });
  }

  const [member] = await prisma.$transaction([
    prisma.organizationMember.create({
      data: { userId, organizationId: invite.organizationId, role: invite.role },
      include: { organization: true },
    }),
    prisma.organizationInvite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } }),
    prisma.user.update({ where: { id: userId }, data: { accountType: 'AGENCY' } }),
  ]);

  return reply.status(201).send(member);
}

// ─── RECUSAR CONVITE (requer auth + e-mail do usuário bater com o do convite) ────────────────

export async function declineInvite(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const { email } = request.user as { email: string };
  const { token } = request.params as { token: string };

  const invite = await prisma.organizationInvite.findUnique({ where: { token } });
  if (!invite || invite.acceptedAt) {
    return reply.status(404).send({ error: 'Convite inválido ou já processado.' });
  }
  if (invite.email !== email.toLowerCase()) {
    return reply.status(403).send({ error: 'Este convite não pertence à sua conta.' });
  }

  await prisma.organizationInvite.delete({ where: { id: invite.id } });
  return reply.send({ declined: true });
}

// ─── CANCELAR CONVITE PENDENTE (requer OWNER/ADMIN da organização do convite) ────────────────

export async function cancelInvite(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const membership = (request as FastifyRequest & { orgMembership: { organizationId: string } }).orgMembership;
  const { id } = request.params as { id: string };

  const invite = await prisma.organizationInvite.findUnique({ where: { id } });
  if (!invite || invite.organizationId !== membership.organizationId) {
    return reply.status(404).send({ error: 'Convite não encontrado.' });
  }
  if (invite.acceptedAt) {
    return reply.status(400).send({ error: 'Este convite já foi aceito.' });
  }

  await prisma.organizationInvite.delete({ where: { id } });
  return reply.send({ cancelled: true });
}

// ─── REMOVER MEMBRO (requer OWNER/ADMIN da organização) ──────────────────────────────────────

/**
 * `OWNER` nunca é removível por aqui (v1 não tem transferência de dono, ver Fase B). Imóveis que
 * estavam atribuídos ao membro removido (`agentId`) são reatribuídos ao `OWNER` da organização,
 * para não ficarem sem responsável.
 */
export async function removeMember(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const { id: userId } = request.user as { id: string };
  const membership = (request as FastifyRequest & { orgMembership: { id: string; organizationId: string } })
    .orgMembership;
  const { userId: targetUserId } = request.params as { userId: string };

  if (targetUserId === userId) {
    return reply.status(400).send({ error: 'Você não pode remover a si mesmo da organização.' });
  }

  const targetMembership = await getMembership(targetUserId);
  if (!targetMembership || targetMembership.organizationId !== membership.organizationId) {
    return reply.status(404).send({ error: 'Esse usuário não é membro da sua organização.' });
  }
  if (targetMembership.role === 'OWNER') {
    return reply.status(400).send({ error: 'O proprietário da organização não pode ser removido.' });
  }

  const owner = await prisma.organizationMember.findFirst({
    where: { organizationId: membership.organizationId, role: 'OWNER' },
  });

  // Leads ainda abertos com este membro precisam de um responsável antes dele sair — sem isso
  // ficariam "presos" com alguém que não tem mais acesso (ver resolveLeadAccess/canViewLeadAccess
  // abaixo, que agora exigem status ACTIVE). Vão pro OWNER, mesmo destino dos imóveis dele.
  const openLeadAssignments = owner
    ? await prisma.leadAssignment.findMany({
        where: { brokerId: targetMembership.id, unassignedAt: null },
        select: { lead: { select: { id: true, userId: true, listingId: true } } },
      })
    : [];

  // Nunca apaga o `OrganizationMember`: `LeadAssignment.brokerId`/`LeadInteraction.memberId`/
  // `Visit.brokerId` são FKs `ON DELETE RESTRICT` — um `delete` aqui falhava (violação de FK, sem
  // tratamento) assim que o membro já tivesse qualquer histórico de CRM, e a remoção nunca
  // acontecia de fato. Em vez disso, marca `INACTIVE`: sai da equipe/distribuição de leads
  // (`resolveLeadAccess`/`canViewLeadAccess`/`requireOrgRole` já exigem ACTIVE) e some da listagem
  // (`getMyOrganization` abaixo), mas o histórico continua íntegro. Trade-off aceito, mesmo espírito
  // do `userId @unique` de V1 já documentado: essa pessoa não pode ser convidada/entrar em outra
  // organização depois — revisitar se isso virar um problema real.
  const [{ count: reassignedListings }] = await prisma.$transaction([
    prisma.listing.updateMany({
      where: { organizationId: membership.organizationId, agentId: targetUserId },
      data: { agentId: owner?.userId ?? null },
    }),
    prisma.organizationMember.update({
      where: { userId: targetUserId },
      data: { status: 'INACTIVE', receiveLeads: false },
    }),
  ]);

  for (const { lead } of openLeadAssignments) {
    await assignLead({
      lead,
      brokerMemberId: owner!.id,
      brokerUserId: owner!.userId,
      assignedByMemberId: membership.id,
      reason: 'Reatribuído automaticamente: corretor removido da organização.',
    });
  }

  return reply.send({ removed: true, reassignedListings, reassignedLeads: openLeadAssignments.length });
}

// ─── IMÓVEIS DA ORGANIZAÇÃO (requer OWNER/ADMIN/MANAGER) ─────────────────────────────────────

export async function getOrganizationListings(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const membership = (request as FastifyRequest & { orgMembership: { organizationId: string } }).orgMembership;

  const listings = await prisma.listing.findMany({
    where: { organizationId: membership.organizationId },
    orderBy: { createdAt: 'desc' },
    include: {
      images: { orderBy: { order: 'asc' } },
      agent: { select: { id: true, name: true, email: true, avatar: true } },
      _count: { select: { conversations: true } },
    },
  });

  return reply.send(listings);
}

// ─── IMÓVEIS ATRIBUÍDOS A MIM (requer pertencer a uma organização, qualquer papel) ────────────

export async function getMyAssignedListings(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const { id: userId } = request.user as { id: string };

  const membership = await getMembership(userId);
  if (!membership) {
    return reply.status(404).send({ error: 'Você não pertence a nenhuma organização.' });
  }

  const listings = await prisma.listing.findMany({
    where: { agentId: userId },
    orderBy: { createdAt: 'desc' },
    include: {
      images: { orderBy: { order: 'asc' } },
      _count: { select: { conversations: true } },
    },
  });

  return reply.send(listings);
}

// ─── MODO DE DISTRIBUIÇÃO DE LEADS (requer OWNER/ADMIN) ──────────────────────────────────────

export async function updateLeadDistributionMode(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const membership = (request as FastifyRequest & { orgMembership: { organizationId: string } }).orgMembership;

  const schema = z.object({ mode: z.enum(['MANUAL', 'ROUND_ROBIN']) });
  const parsed = schema.safeParse(request.body);
  if (!parsed.success) return reply.status(400).send({ error: parsed.error.errors });

  const organization = await prisma.organization.update({
    where: { id: membership.organizationId },
    data: { leadDistributionMode: parsed.data.mode },
  });

  return reply.send({ leadDistributionMode: organization.leadDistributionMode });
}

// ─── OPT-OUT DE RECEBER LEADS (o próprio membro, ou OWNER/ADMIN em nome de outro) ─────────────

/**
 * Só BROKER/MANAGER têm o que ativar/desativar aqui (são os únicos elegíveis pra distribuição,
 * ver ELIGIBLE_LEAD_ROLES). Nunca deixa zerar: sempre precisa sobrar ao menos um membro ACTIVE
 * com receiveLeads=true na organização, senão nenhum lead novo teria pra quem ir.
 */
export async function updateMemberReceiveLeads(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const { id: userId } = request.user as { id: string };
  const { userId: targetUserId } = request.params as { userId: string };

  const schema = z.object({ receiveLeads: z.boolean() });
  const parsed = schema.safeParse(request.body);
  if (!parsed.success) return reply.status(400).send({ error: parsed.error.errors });

  const callerMembership = await getMembership(userId);
  if (!callerMembership) return reply.status(404).send({ error: 'Você não pertence a nenhuma organização.' });

  const targetMembership =
    targetUserId === userId ? callerMembership : await getMembership(targetUserId);
  if (!targetMembership || targetMembership.organizationId !== callerMembership.organizationId) {
    return reply.status(404).send({ error: 'Esse usuário não é membro da sua organização.' });
  }

  const isSelf = targetUserId === userId;
  const canManage = ['OWNER', 'ADMIN'].includes(callerMembership.role);
  if (!isSelf && !canManage) {
    return reply.status(403).send({ error: 'Sem permissão para esta ação.' });
  }

  if (!(ELIGIBLE_LEAD_ROLES as readonly string[]).includes(targetMembership.role)) {
    return reply.status(400).send({ error: 'Esse cargo não recebe leads.' });
  }

  if (!parsed.data.receiveLeads) {
    const otherEligibleCount = await prisma.organizationMember.count({
      where: {
        organizationId: callerMembership.organizationId,
        role: { in: ELIGIBLE_LEAD_ROLES as unknown as string[] },
        status: 'ACTIVE',
        receiveLeads: true,
        id: { not: targetMembership.id },
      },
    });
    if (otherEligibleCount === 0) {
      return reply.status(400).send({
        error: 'Não é possível desativar: é o único que pode receber leads na organização.',
      });
    }
  }

  const updated = await prisma.organizationMember.update({
    where: { id: targetMembership.id },
    data: { receiveLeads: parsed.data.receiveLeads },
  });

  return reply.send({ receiveLeads: updated.receiveLeads });
}

// ─── MÉTRICAS DO CRM (Fase 4, requer OWNER/ADMIN/MANAGER — BROKER não vê métricas) ───────────

const MONTHS_BACK = 6;

function monthLabel(date: Date): string {
  return date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('.', '');
}

export async function getOrganizationMetrics(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const membership = (request as FastifyRequest & { orgMembership: { organizationId: string } }).orgMembership;
  const { organizationId } = membership;

  const [funnelGroups, brokers, assignments, sinceDateLeads] = await Promise.all([
    prisma.lead.groupBy({ by: ['status'], where: { organizationId }, _count: { _all: true } }),
    prisma.organizationMember.findMany({
      where: { organizationId, role: { in: ELIGIBLE_LEAD_ROLES as unknown as string[] } },
      include: { user: { select: { id: true, name: true } } },
    }),
    prisma.leadAssignment.findMany({
      where: { lead: { organizationId } },
      select: { brokerId: true, assignedAt: true, firstContactAt: true, unassignedAt: true, lead: { select: { status: true } } },
    }),
    prisma.lead.findMany({
      where: { organizationId, createdAt: { gte: new Date(Date.now() - MONTHS_BACK * 31 * 24 * 3_600_000) } },
      select: { createdAt: true },
    }),
  ]);

  const funnelCounts = funnelGroups.map((group) => ({ status: group.status, count: group._count._all }));
  const totalLeads = funnelCounts.reduce((sum, group) => sum + group.count, 0);
  const wonCount = funnelCounts.find((group) => group.status === 'WON')?.count ?? 0;
  const lostCount = funnelCounts.find((group) => group.status === 'LOST')?.count ?? 0;
  const conversionRate = totalLeads > 0 ? wonCount / totalLeads : 0;

  const respondedAssignments = assignments.filter((a) => a.firstContactAt !== null);
  const responseHoursList = respondedAssignments.map(
    (a) => (a.firstContactAt!.getTime() - a.assignedAt.getTime()) / 3_600_000
  );
  const avgResponseHours =
    responseHoursList.length > 0
      ? responseHoursList.reduce((sum, hours) => sum + hours, 0) / responseHoursList.length
      : null;
  const slaCompliancePct =
    responseHoursList.length > 0
      ? (responseHoursList.filter((hours) => hours <= SLA_OVERDUE_HOURS).length / responseHoursList.length) * 100
      : null;

  // Leads por mês (últimos 6 meses, incluindo meses sem nenhum lead)
  const monthBuckets: { key: string; label: string; value: number }[] = [];
  const now = new Date();
  for (let i = MONTHS_BACK - 1; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthBuckets.push({ key: `${date.getFullYear()}-${date.getMonth()}`, label: monthLabel(date), value: 0 });
  }
  for (const lead of sinceDateLeads) {
    const key = `${lead.createdAt.getFullYear()}-${lead.createdAt.getMonth()}`;
    const bucket = monthBuckets.find((b) => b.key === key);
    if (bucket) bucket.value += 1;
  }
  const leadsPerMonth = monthBuckets.map(({ label, value }) => ({ label, value }));

  const byBroker = brokers.map((broker) => {
    const own = assignments.filter((a) => a.brokerId === broker.id);
    const ownResponded = own.filter((a) => a.firstContactAt !== null);
    const assignedCount = own.filter((a) => a.unassignedAt === null).length;
    const wonByBroker = own.filter((a) => a.unassignedAt === null && a.lead.status === 'WON').length;
    const avgResponse =
      ownResponded.length > 0
        ? ownResponded.reduce((sum, a) => sum + (a.firstContactAt!.getTime() - a.assignedAt.getTime()) / 3_600_000, 0) /
          ownResponded.length
        : null;

    return {
      memberId: broker.id,
      name: broker.user.name,
      assignedCount,
      wonCount: wonByBroker,
      avgResponseHours: avgResponse,
    };
  });

  return reply.send({
    totalLeads,
    wonCount,
    lostCount,
    conversionRate,
    avgResponseHours,
    slaCompliancePct,
    funnelCounts,
    leadsPerMonth,
    byBroker,
  });
}

export type { OrgRole };
