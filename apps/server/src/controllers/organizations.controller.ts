import type { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { generateInviteToken, inviteExpiresAt, getMembership, logOrgAudit, type OrgRole } from '../lib/organizations.js';
import { sendNotification } from '../services/notification.service.js';
import { sendOrganizationInviteEmail } from '../lib/mail.js';
import {
  SLA_OVERDUE_HOURS,
  LEAD_DISTRIBUTION_ROLES,
  LOST_REASONS,
  CLOSED_LEAD_STATUSES,
  planAndApplyMemberDeparture,
  percentile,
} from '../lib/leads.js';

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
          listings: { where: { operationType: 'DAILY_RENT' }, select: { operationType: true }, take: 1 },
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

  if (!membership || membership.status !== 'ACTIVE') {
    // Para contas AGENCY que já preencheram CNPJ no cadastro (Fase A "de verdade"), auto-inicializa
    // a organização com esses dados. Checar `document` (não só `accountType`) evita criar uma
    // organização fantasma para alguém que só virou AGENCY por ter aceitado um convite (ver
    // `acceptInvite`) e depois foi removido da equipe — essa pessoa nunca preencheu CNPJ/nome de
    // empresa próprios, então não deve "herdar" uma organização ao revisitar esta rota.
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (user && user.accountType === 'AGENCY' && user.document) {
      const organization = await prisma.organization.create({
        data: {
          name: user.companyName || "Imobiliária",
          logo: user.logoUrl,
          coverUrl: user.coverUrl,
          description: user.publicDescription,
          publicLocation: user.publicLocation,
          phone: user.publicPhone,
          email: user.publicEmail,
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

  return reply.send({ role: membership.role, organization: { ...membership.organization, hasSeason: membership.organization.listings.length > 0 } });
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
    where: { organizationId: membership.organizationId, role: 'OWNER', status: 'ACTIVE' },
  });
  if (!owner) return reply.status(409).send({ error: 'A imobiliária precisa de um proprietário ativo antes de remover membros.' });

  // Leads ainda abertos com este membro precisam de um responsável antes dele sair — sem isso
  // ficariam "presos" com alguém que não tem mais acesso (ver resolveLeadAccess/canViewLeadAccess
  // abaixo, que agora exigem status ACTIVE). Vão pro OWNER, mesmo destino dos imóveis dele.
  // Agora: numa transação única com a inativação, cada oportunidade em andamento segue a
  // hierarquia sem quem sai (imóveis já passados ao proprietário contam como responsável do imóvel,
  // mas só se ele estiver recebendo) ou vai para a fila da gestão — nunca para alguém pausado.
  // Encerradas mantêm a atribuição de encerramento para histórico. Falhou → nada muda.
  //
  // Nunca apaga o `OrganizationMember`: `LeadAssignment.brokerId`/`LeadInteraction.memberId`/
  // `Visit.brokerId` são FKs `ON DELETE RESTRICT` — um `delete` aqui falhava (violação de FK, sem
  // tratamento) assim que o membro já tivesse qualquer histórico de CRM, e a remoção nunca
  // acontecia de fato. Em vez disso, marca `INACTIVE`: sai da equipe/distribuição de leads
  // (`resolveLeadAccess`/`canViewLeadAccess`/`requireOrgRole` já exigem ACTIVE) e some da listagem
  // (`getMyOrganization` abaixo), mas o histórico continua íntegro. Trade-off aceito, mesmo espírito
  // do `userId @unique` de V1 já documentado: essa pessoa não pode ser convidada/entrar em outra
  // organização depois — revisitar se isso virar um problema real.
  const { reassignedListings, plan } = await prisma.$transaction(
    async (tx) => {
      const { count } = await tx.listing.updateMany({
        where: { organizationId: membership.organizationId, agentId: targetUserId },
        data: { agentId: owner.userId },
      });
      const leadPlan = await planAndApplyMemberDeparture(tx, { departing: targetMembership, actorMemberId: membership.id });
      await tx.organizationMember.update({
        where: { userId: targetUserId },
        data: { status: 'INACTIVE', receiveLeads: false },
      });
      // Quem entrou por convite/pedido virou AGENCY só por isso (`acceptInvite`/`approveJoinRequest`)
      // — ao sair, volta a ser conta pessoal. `document` só é gravado para quem se cadastrou como
      // imobiliária de verdade (`register`/`completeOnboarding`), então ele distingue os dois casos.
      await tx.user.updateMany({
        where: { id: targetUserId, accountType: 'AGENCY', document: null },
        data: { accountType: 'INDIVIDUAL' },
      });
      return { reassignedListings: count, plan: leadPlan };
    },
    { timeout: 60_000, maxWait: 10_000 }
  );

  const summary = {
    reassignedLeads: plan.filter((p) => p.outcome === 'REASSIGNED').length,
    queuedLeads: plan.filter((p) => p.outcome === 'QUEUED').length,
    keptClosedLeads: plan.filter((p) => p.outcome === 'KEPT_CLOSED').length,
  };
  await logOrgAudit({
    organizationId: membership.organizationId,
    actorMemberId: membership.id,
    action: 'MEMBER_REMOVED',
    entityType: 'MEMBER',
    entityId: targetMembership.id,
    metadata: { reassignedListings, ...summary, plan },
  });

  return reply.send({ removed: true, reassignedListings, ...summary });
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
      _count: { select: { conversations: true, leads: true } },
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
  if (!membership || membership.status !== 'ACTIVE') {
    return reply.status(404).send({ error: 'Você não pertence a nenhuma organização.' });
  }

  const listings = await prisma.listing.findMany({
    where: { organizationId: membership.organizationId, agentId: userId },
    orderBy: { createdAt: 'desc' },
    include: {
      images: { orderBy: { order: 'asc' } },
      agent: { select: { id: true, name: true, avatar: true } },
      _count: { select: { conversations: true, leads: true } },
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
 * BROKER/MANAGER/OWNER são os elegíveis pra distribuição (ver LEAD_DISTRIBUTION_ROLES — seção 12
 * da spec: ser OWNER não impede de vender). Nunca deixa zerar: sempre precisa sobrar ao menos um
 * membro ACTIVE com receiveLeads=true na organização, senão nenhum lead novo teria pra quem ir.
 * Também bloqueia desativar quem é Lead Owner de algum empreendimento sem antes transferir essa
 * responsabilidade (seção 18 da spec) — senão o empreendimento fica "preso" a alguém que não
 * recebe mais leads.
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
  if (!callerMembership || callerMembership.status !== 'ACTIVE') return reply.status(404).send({ error: 'Você não pertence a nenhuma organização.' });

  const targetMembership =
    targetUserId === userId ? callerMembership : await getMembership(targetUserId);
  if (!targetMembership || targetMembership.status !== 'ACTIVE' || targetMembership.organizationId !== callerMembership.organizationId) {
    return reply.status(404).send({ error: 'Esse usuário não é membro da sua organização.' });
  }

  const isSelf = targetUserId === userId;
  const canManage = ['OWNER', 'ADMIN'].includes(callerMembership.role);
  if (!isSelf && !canManage) {
    return reply.status(403).send({ error: 'Sem permissão para esta ação.' });
  }

  if (!(LEAD_DISTRIBUTION_ROLES as readonly string[]).includes(targetMembership.role)) {
    return reply.status(400).send({ error: 'Esse cargo não recebe leads.' });
  }

  if (!parsed.data.receiveLeads) {
    const otherEligibleCount = await prisma.organizationMember.count({
      where: {
        organizationId: callerMembership.organizationId,
        role: { in: LEAD_DISTRIBUTION_ROLES as unknown as string[] },
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

    const ownedBuilding = await prisma.organizationBuilding.findFirst({
      where: { leadOwnerMemberId: targetMembership.id },
      select: { id: true, name: true },
    });
    if (ownedBuilding) {
      return reply.status(400).send({
        error: `Você é responsável pelos leads do empreendimento "${ownedBuilding.name}". Para deixar de receber novos leads, transfira essa responsabilidade para outra pessoa ou reative o recebimento.`,
      });
    }
  }

  const updated = await prisma.organizationMember.update({
    where: { id: targetMembership.id },
    data: { receiveLeads: parsed.data.receiveLeads },
  });

  return reply.send({ receiveLeads: updated.receiveLeads });
}

// ─── MÉTRICAS DO CRM (gestão + leitura do assistente) ────────────────────────────────────────
// Separa a FOTOGRAFIA da carteira atual dos RESULTADOS do período. Cada taxa sai com o próprio
// numerador/denominador, para a tela explicitar o que está medindo.

const MONTHS_BACK = 6;

function monthLabel(date: Date): string {
  return date.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('.', '');
}

const hoursBetween = (a: Date, b: Date) => (b.getTime() - a.getTime()) / 3_600_000;
const median = (values: number[]) => percentile(values, 50);
const OPERATION_LABELS: Record<string, string> = { SALE: 'Venda', MONTHLY_RENT: 'Aluguel mensal', DAILY_RENT: 'Temporada' };
const SOURCE_LABELS: Record<string, string> = {
  CHAT: 'Chat', BOOKING: 'Reserva', OFFER: 'Proposta', WHATSAPP: 'WhatsApp', PHONE: 'Telefone',
  WALK_IN: 'Plantão', REFERRAL: 'Indicação', FORM: 'Formulário', OTHER: 'Outro',
};

export async function getOrganizationMetrics(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const membership = (request as FastifyRequest & { orgMembership: { organizationId: string } }).orgMembership;
  const { organizationId } = membership;
  const parsed = z.object({ days: z.coerce.number().refine((n) => [7, 30, 90, 180, 365].includes(n)).default(30) }).safeParse(request.query);
  if (!parsed.success) return reply.status(400).send({ error: 'Período inválido.' });
  const days = parsed.data.days;
  const since = new Date(Date.now() - days * 86_400_000);
  const now = Date.now();

  const [funnelGroups, brokers, assignments, sinceDateLeads, periodLeads, closedInPeriod, openLeads] = await Promise.all([
    prisma.lead.groupBy({ by: ['status'], where: { organizationId }, _count: { _all: true } }),
    prisma.organizationMember.findMany({
      where: { organizationId, role: { in: LEAD_DISTRIBUTION_ROLES as unknown as string[] } },
      include: { user: { select: { id: true, name: true } } },
    }),
    prisma.leadAssignment.findMany({
      where: { lead: { organizationId }, broker: { organizationId } },
      select: { brokerId: true, assignedAt: true, firstContactAt: true, unassignedAt: true, lead: { select: { status: true } } },
    }),
    prisma.lead.findMany({
      where: { organizationId, createdAt: { gte: new Date(now - MONTHS_BACK * 31 * 24 * 3_600_000) } },
      select: { createdAt: true },
    }),
    prisma.lead.findMany({
      where: { organizationId, createdAt: { gte: since } },
      select: {
        id: true, status: true, source: true, createdAt: true,
        listing: { select: { operationType: true, building: { select: { id: true, name: true } } } },
        assignments: { orderBy: { assignedAt: 'asc' }, select: { brokerId: true, assignedAt: true, firstContactAt: true, unassignedAt: true } },
      },
    }),
    prisma.lead.findMany({
      where: { organizationId, status: { in: CLOSED_LEAD_STATUSES }, closedAt: { gte: since } },
      select: { status: true, lostReason: true, source: true, listing: { select: { operationType: true, building: { select: { id: true, name: true } } } }, assignments: { where: { unassignedAt: null }, select: { brokerId: true } } },
    }),
    prisma.lead.findMany({
      where: { organizationId, status: { notIn: CLOSED_LEAD_STATUSES } },
      select: { status: true, assignments: { where: { unassignedAt: null }, select: { brokerId: true, assignedAt: true, firstContactAt: true } } },
    }),
  ]);

  // ── Histórico (compatibilidade com a tela atual) ──
  const funnelCounts = funnelGroups.map((group) => ({ status: group.status, count: group._count._all }));
  const totalLeads = funnelCounts.reduce((sum, group) => sum + group.count, 0);
  const wonCount = funnelCounts.find((group) => group.status === 'WON')?.count ?? 0;
  const lostCount = funnelCounts.find((group) => group.status === 'LOST')?.count ?? 0;
  const conversionRate = totalLeads > 0 ? wonCount / totalLeads : 0;
  const responded = assignments.filter((a) => a.firstContactAt !== null);
  const responseHoursList = responded.map((a) => hoursBetween(a.assignedAt, a.firstContactAt!));
  const avgResponseHours = responseHoursList.length ? responseHoursList.reduce((s, h) => s + h, 0) / responseHoursList.length : null;
  const slaCompliancePct = responseHoursList.length
    ? (responseHoursList.filter((h) => h <= SLA_OVERDUE_HOURS).length / responseHoursList.length) * 100
    : null;

  const monthBuckets: { key: string; label: string; value: number }[] = [];
  const today = new Date();
  for (let i = MONTHS_BACK - 1; i >= 0; i--) {
    const date = new Date(today.getFullYear(), today.getMonth() - i, 1);
    monthBuckets.push({ key: `${date.getFullYear()}-${date.getMonth()}`, label: monthLabel(date), value: 0 });
  }
  for (const lead of sinceDateLeads) {
    const bucket = monthBuckets.find((b) => b.key === `${lead.createdAt.getFullYear()}-${lead.createdAt.getMonth()}`);
    if (bucket) bucket.value += 1;
  }

  // ── Fotografia da carteira atual ──
  const openAssigned = openLeads.filter((l) => l.assignments.length);
  const waiting = openAssigned.filter((l) => !l.assignments[0]!.firstContactAt);
  const snapshot = {
    open: openLeads.length,
    unassigned: openLeads.length - openAssigned.length,
    awaitingResponse: waiting.length,
    overdue: waiting.filter((l) => hoursBetween(l.assignments[0]!.assignedAt, new Date()) >= SLA_OVERDUE_HOURS).length,
    byStatus: Object.fromEntries(funnelCounts.filter((f) => !CLOSED_LEAD_STATUSES.includes(f.status)).map((f) => [f.status, f.count])),
  };

  // ── Resultados do período ──
  const periodAssignments = assignments.filter((a) => a.assignedAt >= since);
  const periodResponseHours = periodAssignments.filter((a) => a.firstContactAt).map((a) => hoursBetween(a.assignedAt, a.firstContactAt!));
  // Denominador do "no prazo": atribuições do período já respondidas ou cujo prazo já venceu.
  const dueAssignments = periodAssignments.filter((a) => a.firstContactAt || hoursBetween(a.assignedAt, new Date()) >= SLA_OVERDUE_HOURS);
  const onTime = periodAssignments.filter((a) => a.firstContactAt && hoursBetween(a.assignedAt, a.firstContactAt) <= SLA_OVERDUE_HOURS).length;
  const timeToAssignment = periodLeads.filter((l) => l.assignments[0]).map((l) => hoursBetween(l.createdAt, l.assignments[0]!.assignedAt));
  const periodWon = closedInPeriod.filter((l) => l.status === 'WON').length;
  const periodLost = closedInPeriod.length - periodWon;
  const lostReasons: Record<string, number> = {};
  for (const lead of closedInPeriod.filter((l) => l.status === 'LOST')) {
    const key = lead.lostReason ?? 'NOT_RECORDED';
    lostReasons[key] = (lostReasons[key] ?? 0) + 1;
  }

  type Cut = { key: string; label: string; entries: number; won: number; lost: number; responseHours: number[] };
  const cut = (map: Map<string, Cut>, key: string, label: string) => {
    if (!map.has(key)) map.set(key, { key, label, entries: 0, won: 0, lost: 0, responseHours: [] });
    return map.get(key)!;
  };
  const bySource = new Map<string, Cut>(), byOperation = new Map<string, Cut>(), byBuilding = new Map<string, Cut>(), byResponsible = new Map<string, Cut>();
  const brokerName = (id: string | undefined) => brokers.find((b) => b.id === id)?.user.name ?? 'Sem responsável';
  for (const lead of periodLeads) {
    const first = lead.assignments[0];
    const hours = first?.firstContactAt ? [hoursBetween(first.assignedAt, first.firstContactAt)] : [];
    const current = lead.assignments.find((a) => !a.unassignedAt);
    for (const c of [
      cut(bySource, lead.source, SOURCE_LABELS[lead.source] ?? lead.source),
      cut(byOperation, lead.listing.operationType, OPERATION_LABELS[lead.listing.operationType] ?? lead.listing.operationType),
      cut(byBuilding, lead.listing.building?.id ?? 'none', lead.listing.building?.name ?? 'Sem empreendimento'),
      cut(byResponsible, current?.brokerId ?? 'none', brokerName(current?.brokerId)),
    ]) {
      c.entries += 1;
      c.responseHours.push(...hours);
    }
  }
  for (const lead of closedInPeriod) {
    const outcome = lead.status === 'WON' ? 'won' : 'lost';
    const brokerId = lead.assignments[0]?.brokerId;
    cut(bySource, lead.source, SOURCE_LABELS[lead.source] ?? lead.source)[outcome] += 1;
    cut(byOperation, lead.listing.operationType, OPERATION_LABELS[lead.listing.operationType] ?? lead.listing.operationType)[outcome] += 1;
    cut(byBuilding, lead.listing.building?.id ?? 'none', lead.listing.building?.name ?? 'Sem empreendimento')[outcome] += 1;
    cut(byResponsible, brokerId ?? 'none', brokerName(brokerId))[outcome] += 1;
  }
  const finish = (map: Map<string, Cut>) =>
    [...map.values()]
      .map(({ responseHours, ...c }) => ({
        ...c,
        winRateClosed: c.won + c.lost ? c.won / (c.won + c.lost) : null,
        medianResponseHours: median(responseHours),
        respondedCount: responseHours.length,
      }))
      .sort((a, b) => b.entries - a.entries);

  const period = {
    days,
    since,
    entries: periodLeads.length,
    won: periodWon,
    lost: periodLost,
    // ganhos / (ganhos + perdidos) — só oportunidades encerradas no período
    winRateClosed: periodWon + periodLost ? periodWon / (periodWon + periodLost) : null,
    response: {
      assignments: periodAssignments.length,
      responded: periodResponseHours.length,
      medianHours: median(periodResponseHours),
      p90Hours: percentile(periodResponseHours, 90),
      onTime,
      due: dueAssignments.length,
      onTimeRate: dueAssignments.length ? onTime / dueAssignments.length : null,
    },
    timeToAssignment: { assigned: timeToAssignment.length, medianHours: median(timeToAssignment), p90Hours: percentile(timeToAssignment, 90) },
    lostReasons: Object.entries(lostReasons)
      .map(([reason, count]) => ({ reason, label: reason === 'NOT_RECORDED' ? 'Motivo não registrado' : LOST_REASONS[reason as keyof typeof LOST_REASONS] ?? reason, count }))
      .sort((a, b) => b.count - a.count),
    bySource: finish(bySource),
    byOperationType: finish(byOperation),
    byBuilding: finish(byBuilding),
    byResponsible: finish(byResponsible),
  };

  const byBroker = [];
  const formerBrokers = [];
  for (const broker of brokers) {
    const own = assignments.filter((a) => a.brokerId === broker.id);
    const ownResponded = own.filter((a) => a.firstContactAt !== null).map((a) => hoursBetween(a.assignedAt, a.firstContactAt!));
    const avgResponse = ownResponded.length ? ownResponded.reduce((s, h) => s + h, 0) / ownResponded.length : null;
    if (broker.status !== 'ACTIVE') {
      if (broker.status === 'INACTIVE' && own.length > 0) {
        formerBrokers.push({ memberId: broker.id, name: broker.user.name, assignmentCount: own.length, avgResponseHours: avgResponse });
      }
      continue;
    }
    const openOwn = openAssigned.filter((l) => l.assignments[0]!.brokerId === broker.id);
    byBroker.push({
      memberId: broker.id,
      name: broker.user.name,
      receiveLeads: broker.receiveLeads,
      assignedCount: own.filter((a) => a.unassignedAt === null).length,
      openCount: openOwn.length,
      awaitingResponse: openOwn.filter((l) => !l.assignments[0]!.firstContactAt).length,
      wonCount: own.filter((a) => a.unassignedAt === null && a.lead.status === 'WON').length,
      avgResponseHours: avgResponse,
      medianResponseHours: median(ownResponded),
    });
  }

  return reply.send({
    totalLeads,
    wonCount,
    lostCount,
    conversionRate,
    conversionDenominator: 'total',
    avgResponseHours,
    slaCompliancePct,
    slaHours: SLA_OVERDUE_HOURS,
    funnelCounts,
    leadsPerMonth: monthBuckets.map(({ label, value }) => ({ label, value })),
    byBroker,
    formerBrokers,
    snapshot,
    period,
  });
}

// ─── EMPREENDIMENTOS (seção 8/63/128 da spec) — requer pertencer à organização ────────────────

/** Qualquer membro ativo pode ver a lista, pra escolher um no cadastro de imóvel (seção 63). */
export async function listOrganizationBuildings(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const membership = (request as FastifyRequest & { orgMembership: { organizationId: string } }).orgMembership;

  const buildings = await prisma.organizationBuilding.findMany({
    where: { organizationId: membership.organizationId },
    include: {
      leadOwner: { include: { user: { select: { id: true, name: true } } } },
      backupMember: { include: { user: { select: { id: true, name: true } } } },
      _count: { select: { listings: true } },
    },
    orderBy: { name: 'asc' },
  });

  return reply.send(buildings);
}

/**
 * Criar empreendimento nasce sem Lead Owner/backup (seção 8) — atribuir isso é uma ação
 * separada e explícita (seção 10/74, ver `assumeBuildingLeadOwnership` em
 * `listings.controller.ts`), nunca automática no ato de criar.
 */
export async function createOrganizationBuilding(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const membership = (request as FastifyRequest & { orgMembership: { organizationId: string } }).orgMembership;

  const schema = z.object({ name: z.string().trim().min(1), address: z.string().trim().optional() });
  const parsed = schema.safeParse(request.body);
  if (!parsed.success) return reply.status(400).send({ error: parsed.error.errors });

  const building = await prisma.organizationBuilding.create({
    data: {
      name: parsed.data.name,
      address: parsed.data.address ?? null,
      organizationId: membership.organizationId,
    },
  });

  return reply.status(201).send(building);
}

/** Renomear/editar endereço (requer poder criar/editar imóvel: OWNER/ADMIN/BROKER). */
export async function updateOrganizationBuilding(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const membership = (request as FastifyRequest & { orgMembership: { organizationId: string } }).orgMembership;
  const { id } = request.params as { id: string };

  const building = await prisma.organizationBuilding.findUnique({ where: { id } });
  if (!building || building.organizationId !== membership.organizationId) {
    return reply.status(404).send({ error: 'Empreendimento não encontrado.' });
  }

  const schema = z.object({ name: z.string().trim().min(1).optional(), address: z.string().trim().nullable().optional() });
  const parsed = schema.safeParse(request.body);
  if (!parsed.success) return reply.status(400).send({ error: parsed.error.errors });

  const updated = await prisma.organizationBuilding.update({
    where: { id },
    data: { ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}), ...(parsed.data.address !== undefined ? { address: parsed.data.address } : {}) },
  });

  return reply.send(updated);
}

async function isEligibleForBuildingRole(memberId: string, organizationId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const member = await prisma.organizationMember.findUnique({ where: { id: memberId } });
  if (!member || member.organizationId !== organizationId) return { ok: false, error: 'Membro não encontrado nesta organização.' };
  if (member.status !== 'ACTIVE') return { ok: false, error: 'Esse membro está inativo.' };
  if (!(LEAD_DISTRIBUTION_ROLES as readonly string[]).includes(member.role)) {
    return { ok: false, error: 'Escolha um proprietário, gerente ou corretor.' };
  }
  if (!member.receiveLeads) return { ok: false, error: 'Esse membro optou por não receber leads no momento.' };
  return { ok: true };
}

/**
 * Atribuição/transferência EXPLÍCITA de Lead Owner (seção 74/75/128 da spec) — diferente do
 * checkbox "Assumir todos os Leads deste empreendimento" no cadastro de imóvel
 * (`assumeBuildingLeadOwnership` em `listings.controller.ts`), que se recusa a sobrescrever um
 * dono já existente. Aqui é uma ação administrativa autorizada (só OWNER/ADMIN, "apenas
 * OWNER/MANAGER com permissão pode transferir" da seção 75) e PODE substituir quem já era o dono.
 */
export async function setBuildingLeadOwner(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const membership = (request as FastifyRequest & { orgMembership: { id: string; organizationId: string } }).orgMembership;
  const { id } = request.params as { id: string };

  const building = await prisma.organizationBuilding.findUnique({ where: { id } });
  if (!building || building.organizationId !== membership.organizationId) {
    return reply.status(404).send({ error: 'Empreendimento não encontrado.' });
  }

  const schema = z.object({ memberId: z.string().nullable() });
  const parsed = schema.safeParse(request.body);
  if (!parsed.success) return reply.status(400).send({ error: parsed.error.errors });

  if (parsed.data.memberId) {
    const eligible = await isEligibleForBuildingRole(parsed.data.memberId, membership.organizationId);
    if (!eligible.ok) return reply.status(400).send({ error: eligible.error });
  }

  const updated = await prisma.organizationBuilding.update({
    where: { id },
    data: { leadOwnerMemberId: parsed.data.memberId },
  });

  await logOrgAudit({
    organizationId: membership.organizationId,
    actorMemberId: membership.id,
    action: 'BUILDING_LEAD_OWNER_CHANGED',
    entityType: 'BUILDING',
    entityId: id,
    metadata: { from: building.leadOwnerMemberId, to: parsed.data.memberId },
  });

  return reply.send(updated);
}

/** Backup do empreendimento (seção 17 da spec) — mesma elegibilidade do Lead Owner. */
export async function setBuildingBackup(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const membership = (request as FastifyRequest & { orgMembership: { id: string; organizationId: string } }).orgMembership;
  const { id } = request.params as { id: string };

  const building = await prisma.organizationBuilding.findUnique({ where: { id } });
  if (!building || building.organizationId !== membership.organizationId) {
    return reply.status(404).send({ error: 'Empreendimento não encontrado.' });
  }

  const schema = z.object({ memberId: z.string().nullable() });
  const parsed = schema.safeParse(request.body);
  if (!parsed.success) return reply.status(400).send({ error: parsed.error.errors });

  if (parsed.data.memberId) {
    const eligible = await isEligibleForBuildingRole(parsed.data.memberId, membership.organizationId);
    if (!eligible.ok) return reply.status(400).send({ error: eligible.error });
  }

  const updated = await prisma.organizationBuilding.update({
    where: { id },
    data: { backupMemberId: parsed.data.memberId },
  });

  await logOrgAudit({
    organizationId: membership.organizationId,
    actorMemberId: membership.id,
    action: 'BUILDING_BACKUP_CHANGED',
    entityType: 'BUILDING',
    entityId: id,
    metadata: { from: building.backupMemberId, to: parsed.data.memberId },
  });

  return reply.send(updated);
}

// ─── LOG DE AUDITORIA DA ORGANIZAÇÃO (seção 125 da spec, requer OWNER/ADMIN) ──────────────────

const AUDIT_LOG_PAGE_SIZE = 30;

export async function getOrganizationAuditLog(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const membership = (request as FastifyRequest & { orgMembership: { organizationId: string } }).orgMembership;
  const { page: pageParam } = request.query as { page?: string };
  const page = Math.max(1, Number(pageParam) || 1);

  const [items, total] = await Promise.all([
    prisma.organizationAuditLog.findMany({
      where: { organizationId: membership.organizationId },
      include: { actor: { include: { user: { select: { id: true, name: true } } } } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * AUDIT_LOG_PAGE_SIZE,
      take: AUDIT_LOG_PAGE_SIZE,
    }),
    prisma.organizationAuditLog.count({ where: { organizationId: membership.organizationId } }),
  ]);

  return reply.send({ items, total, page, limit: AUDIT_LOG_PAGE_SIZE });
}

export type { OrgRole };
