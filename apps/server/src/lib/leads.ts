import { Prisma, type Lead, type Organization, type OrganizationMember } from '@prisma/client';
import { prisma } from './prisma.js';
import { getMembership } from './organizations.js';

type Tx = Prisma.TransactionClient;

// Papéis elegíveis para receber leads (distribuição automática e atribuição manual) — Corretor,
// Gerente e também o OWNER (seções 12/13 da spec: ser dono da organização não impede de vender).
// ADMIN/ASSISTANT gerenciam o CRM mas não entram na distribuição por padrão.
export const LEAD_DISTRIBUTION_ROLES = ['OWNER', 'MANAGER', 'BROKER'] as const;
export const LEAD_MANAGE_ROLES = ['OWNER', 'ADMIN', 'MANAGER'] as const;

export const LEAD_STATUSES = ['NEW', 'CONTACTED', 'QUALIFIED', 'VISIT_SCHEDULED', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST'] as const;
export const CLOSED_LEAD_STATUSES = ['WON', 'LOST'];
export const isClosedStatus = (status: string) => CLOSED_LEAD_STATUSES.includes(status);

// Motivos estruturados de perda (mapeamento CRM, seção 7 P1) — código estável + rótulo de tela.
export const LOST_REASONS = {
  PRICE: 'Preço ou condições',
  FOUND_OTHER: 'Escolheu outro imóvel',
  LOCATION: 'Localização',
  FINANCING: 'Crédito ou financiamento',
  UNAVAILABLE: 'Imóvel ou datas indisponíveis',
  NO_RESPONSE: 'Cliente parou de responder',
  GAVE_UP: 'Desistiu da busca',
  DUPLICATE: 'Contato duplicado ou inválido',
  OTHER: 'Outro motivo',
} as const;
export type LostReason = keyof typeof LOST_REASONS;

// Origens de captação. CHAT/BOOKING/OFFER/WHATSAPP vêm do produto; o resto é registro pela equipe.
export const LEAD_SOURCES = ['CHAT', 'BOOKING', 'OFFER', 'WHATSAPP', 'PHONE', 'WALK_IN', 'REFERRAL', 'FORM', 'OTHER'] as const;
export const TEAM_ENTRY_SOURCES = ['PHONE', 'WHATSAPP', 'WALK_IN', 'REFERRAL', 'FORM', 'OTHER'] as const;

// Canais externos que, com desfecho CONTACT, contam como 1ª resposta efetiva. NOTE e STATUS_CHANGE nunca contam.
export const RESPONSE_CHANNELS = ['PHONE_CALL', 'WHATSAPP', 'EMAIL', 'VISIT'];

// Origem de uma atribuição — seção 32 da spec. Guardado em LeadAssignment.source pra métricas/auditoria.
export type LeadAssignmentSource =
  | 'BUILDING_OWNER'
  | 'LISTING_AGENT'
  | 'ROUND_ROBIN'
  | 'MANUAL'
  | 'SELF_ASSIGNED'
  | 'TRANSFER'
  | 'BACKUP'
  | 'MEMBER_REMOVED';

export const ASSIGNMENT_SOURCE_LABELS: Record<string, string> = {
  BUILDING_OWNER: 'Responsável principal do empreendimento',
  BACKUP: 'Substituto do empreendimento',
  LISTING_AGENT: 'Responsável comercial do imóvel',
  ROUND_ROBIN: 'Rodízio da imobiliária',
  MANUAL: 'Atribuição manual',
  SELF_ASSIGNED: 'Assumido pela própria pessoa',
  TRANSFER: 'Transferência',
  MEMBER_REMOVED: 'Redistribuído na saída de um integrante',
};

export type EligibilityProblem = 'MEMBER_NOT_IN_ORG' | 'MEMBER_INACTIVE' | 'MEMBER_INELIGIBLE_ROLE' | 'MEMBER_NOT_RECEIVING_LEADS';

/**
 * Definição ÚNICA de "pode receber leads" — usada pela distribuição, pela transferência manual,
 * pelo seletor da ficha e pelas contagens de Equipe (antes cada um tinha a sua e divergiam).
 */
export function leadEligibilityProblem(
  member: { role: string; status: string; receiveLeads: boolean; organizationId: string } | null | undefined,
  organizationId: string
): EligibilityProblem | null {
  if (!member || member.organizationId !== organizationId) return 'MEMBER_NOT_IN_ORG';
  if (member.status !== 'ACTIVE') return 'MEMBER_INACTIVE';
  if (!(LEAD_DISTRIBUTION_ROLES as readonly string[]).includes(member.role)) return 'MEMBER_INELIGIBLE_ROLE';
  if (!member.receiveLeads) return 'MEMBER_NOT_RECEIVING_LEADS';
  return null;
}

export const ELIGIBILITY_MESSAGES: Record<EligibilityProblem, string> = {
  MEMBER_NOT_IN_ORG: 'Escolha um membro da sua organização.',
  MEMBER_INACTIVE: 'Esse membro está inativo.',
  MEMBER_INELIGIBLE_ROLE: 'Escolha um corretor, gerente ou proprietário.',
  MEMBER_NOT_RECEIVING_LEADS: 'Esse membro pausou o recebimento de leads no momento.',
};

/** Membros que podem aparecer no seletor de responsável, com o motivo de quem não pode receber. */
export async function listLeadAssignees(organizationId: string) {
  const [members, openCounts] = await Promise.all([
    prisma.organizationMember.findMany({
      where: { organizationId, status: 'ACTIVE', role: { in: LEAD_DISTRIBUTION_ROLES as unknown as string[] } },
      include: { user: { select: { id: true, name: true, avatar: true } } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    }),
    prisma.leadAssignment.groupBy({
      by: ['brokerId'],
      where: { unassignedAt: null, lead: { organizationId, status: { notIn: CLOSED_LEAD_STATUSES } } },
      _count: { _all: true },
    }),
  ]);
  return members.map((member) => {
    const problem = leadEligibilityProblem(member, organizationId);
    return {
      memberId: member.id,
      userId: member.userId,
      name: member.user.name,
      avatar: member.user.avatar,
      role: member.role,
      receiveLeads: member.receiveLeads,
      eligible: problem === null,
      ineligibleReason: problem ? ELIGIBILITY_MESSAGES[problem] : null,
      openLeads: openCounts.find((row) => row.brokerId === member.id)?._count._all ?? 0,
    };
  });
}

export function getCurrentAssignment(leadId: string, client: Tx | typeof prisma = prisma) {
  return client.leadAssignment.findFirst({
    where: { leadId, unassignedAt: null },
    orderBy: { assignedAt: 'desc' },
  });
}

/** Serializa toda escrita de responsável/etapa de um lead (SELECT ... FOR UPDATE na linha do Lead). */
async function lockLead(tx: Tx, leadId: string): Promise<Lead | null> {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Lead" WHERE "id" = ${leadId} FOR UPDATE`;
  if (!rows[0]) return null;
  return tx.lead.findUnique({ where: { id: leadId } });
}

function isRetryable(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(err.code);
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i < attempts - 1 && isRetryable(err)) continue;
      throw err;
    }
  }
}

/**
 * Acesso comercial ao chat acompanha o responsável atual: em todas as conversas do lead (por
 * `leadId`, e as legadas do mesmo cliente+imóvel ainda sem vínculo, que passam a tê-lo), ficam só o
 * cliente e o responsável. Sem responsável, fica só o cliente. Mensagens são preservadas.
 */
async function syncConversationParticipantsTx(
  tx: Tx,
  lead: { id: string; userId: string; listingId: string },
  responsibleUserId: string | null
): Promise<void> {
  const conversations = await tx.conversation.findMany({
    where: {
      OR: [
        { leadId: lead.id },
        { leadId: null, propertyId: lead.listingId, participants: { some: { id: lead.userId } } },
      ],
    },
    include: { participants: { select: { id: true } } },
  });
  for (const conversation of conversations) {
    const keep = new Set([lead.userId, ...(responsibleUserId ? [responsibleUserId] : [])]);
    const stale = conversation.participants.filter((p) => !keep.has(p.id));
    const missing = responsibleUserId && !conversation.participants.some((p) => p.id === responsibleUserId) && responsibleUserId !== lead.userId;
    if (!stale.length && !missing && conversation.leadId === lead.id) continue;
    await tx.conversation.update({
      where: { id: conversation.id },
      data: {
        leadId: lead.id,
        participants: {
          ...(stale.length ? { disconnect: stale.map((p) => ({ id: p.id })) } : {}),
          ...(missing ? { connect: { id: responsibleUserId! } } : {}),
        },
      },
    });
  }
}

/**
 * Troca o responsável dentro de uma transação já aberta (o chamador trava o lead). Nunca
 * sobrescreve: fecha a atribuição aberta e cria outra. Mesma pessoa = operação idempotente.
 * `moveOpenWork` leva tarefas pendentes e visitas futuras do responsável anterior para o novo.
 */
export async function assignLeadTx(
  tx: Tx,
  {
    lead,
    brokerMemberId,
    assignedByMemberId,
    reason,
    source,
    moveOpenWork = false,
  }: {
    lead: { id: string; userId: string; listingId: string };
    brokerMemberId: string;
    assignedByMemberId: string | null;
    reason?: string | undefined;
    source?: LeadAssignmentSource | undefined;
    moveOpenWork?: boolean;
  }
) {
  const broker = await tx.organizationMember.findUniqueOrThrow({ where: { id: brokerMemberId } });
  const current = await getCurrentAssignment(lead.id, tx);
  if (current?.brokerId === brokerMemberId) {
    await syncConversationParticipantsTx(tx, lead, broker.userId);
    return { assignment: current, changed: false as const, previous: current };
  }
  if (current) {
    await tx.leadAssignment.update({
      where: { id: current.id },
      data: { unassignedAt: new Date(), reason: reason ?? null },
    });
  }
  const assignment = await tx.leadAssignment.create({
    data: { leadId: lead.id, brokerId: brokerMemberId, assignedBy: assignedByMemberId, source: source ?? null, reason: current ? null : reason ?? null },
  });
  await tx.lead.update({ where: { id: lead.id }, data: { queuedAt: null, queueReason: null } });

  if (moveOpenWork && current) {
    await tx.leadTask.updateMany({
      where: { leadId: lead.id, completedAt: null, OR: [{ assigneeId: current.brokerId }, { assigneeId: null, memberId: current.brokerId }] },
      data: { assigneeId: brokerMemberId },
    });
    await tx.visit.updateMany({
      where: { leadId: lead.id, brokerId: current.brokerId, scheduledAt: { gte: new Date() }, status: { in: ['SCHEDULED', 'CONFIRMED'] } },
      data: { brokerId: brokerMemberId },
    });
  }

  await syncConversationParticipantsTx(tx, lead, broker.userId);
  return { assignment, changed: true as const, previous: current };
}

/** Fecha a atribuição aberta (se houver) e coloca o lead na fila "Sem responsável". */
export async function unassignLeadTx(
  tx: Tx,
  lead: { id: string; userId: string; listingId: string },
  { reason, queueReason }: { reason: string; queueReason: string }
): Promise<void> {
  const current = await getCurrentAssignment(lead.id, tx);
  if (current) {
    await tx.leadAssignment.update({ where: { id: current.id }, data: { unassignedAt: new Date(), reason } });
  }
  await tx.lead.update({ where: { id: lead.id }, data: { queuedAt: new Date(), queueReason } });
  await syncConversationParticipantsTx(tx, lead, null);
}

/** Compatibilidade (scripts): atribuição numa transação própria, com trava do lead. */
export async function assignLead(args: {
  lead: { id: string; userId: string; listingId: string };
  brokerMemberId: string;
  brokerUserId?: string;
  assignedByMemberId: string | null;
  reason?: string | undefined;
  source?: LeadAssignmentSource | undefined;
}) {
  return withRetry(() =>
    prisma.$transaction(async (tx) => {
      await lockLead(tx, args.lead.id);
      return (await assignLeadTx(tx, args)).assignment;
    })
  );
}

/**
 * Round Robin real (seção 19/20 da spec). `Organization.leadRoundRobinCursor` guarda o último
 * membro que recebeu; o próximo é o seguinte na lista ordenada de elegíveis. A linha da
 * Organization fica travada (`FOR UPDATE`) na MESMA transação que grava a atribuição — o turno só
 * é consumido junto da atribuição efetiva (se a transação falhar, o cursor volta junto).
 */
export async function pickRoundRobinMember(
  organizationId: string,
  tx?: Tx,
  excludeMemberIds: string[] = []
): Promise<OrganizationMember | null> {
  const run = async (client: Tx) => {
    const locked = await client.$queryRaw<{ id: string; leadRoundRobinCursor: string | null }[]>`
      SELECT "id", "leadRoundRobinCursor" FROM "Organization" WHERE "id" = ${organizationId} FOR UPDATE
    `;
    if (!locked[0]) return null;

    const eligible = await client.organizationMember.findMany({
      where: {
        organizationId,
        role: { in: LEAD_DISTRIBUTION_ROLES as unknown as string[] },
        status: 'ACTIVE',
        receiveLeads: true,
        ...(excludeMemberIds.length ? { id: { notIn: excludeMemberIds } } : {}),
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    if (eligible.length === 0) return null;

    const cursorIdx = locked[0].leadRoundRobinCursor
      ? eligible.findIndex((m) => m.id === locked[0]!.leadRoundRobinCursor)
      : -1;
    const chosen = eligible[(cursorIdx + 1) % eligible.length]!;

    await client.organization.update({ where: { id: organizationId }, data: { leadRoundRobinCursor: chosen.id } });
    return chosen;
  };
  return tx ? run(tx) : prisma.$transaction(run);
}

/**
 * Hierarquia de distribuição (seção 15 da spec): principal do empreendimento → substituto →
 * responsável comercial do imóvel → rodízio (só em ROUND_ROBIN) → sem responsável (fila).
 * Elegibilidade sempre pela definição única `leadEligibilityProblem` e sempre na mesma organização.
 */
export async function resolveLeadAssignee(
  listing: { id: string; agentId: string | null; buildingId: string | null },
  organization: Pick<Organization, 'id' | 'leadDistributionMode'>,
  { tx, excludeMemberIds = [] }: { tx?: Tx; excludeMemberIds?: string[] } = {}
): Promise<{ memberId: string; userId: string; source: LeadAssignmentSource } | null> {
  const client = tx ?? prisma;
  const ok = (m: OrganizationMember | null | undefined): m is OrganizationMember =>
    !!m && !excludeMemberIds.includes(m.id) && leadEligibilityProblem(m, organization.id) === null;

  if (listing.buildingId) {
    const building = await client.organizationBuilding.findUnique({
      where: { id: listing.buildingId },
      include: { leadOwner: true, backupMember: true },
    });
    if (building && building.organizationId === organization.id) {
      if (ok(building.leadOwner)) return { memberId: building.leadOwner.id, userId: building.leadOwner.userId, source: 'BUILDING_OWNER' };
      if (ok(building.backupMember)) return { memberId: building.backupMember.id, userId: building.backupMember.userId, source: 'BACKUP' };
    }
  }

  if (listing.agentId) {
    const agentMembership = await client.organizationMember.findUnique({ where: { userId: listing.agentId } });
    if (ok(agentMembership)) return { memberId: agentMembership.id, userId: agentMembership.userId, source: 'LISTING_AGENT' };
  }

  if (organization.leadDistributionMode === 'ROUND_ROBIN') {
    const chosen = await pickRoundRobinMember(organization.id, tx, excludeMemberIds);
    if (chosen) return { memberId: chosen.id, userId: chosen.userId, source: 'ROUND_ROBIN' };
  }

  return null;
}

/** Encaminha um lead sem responsável (já travado) pela hierarquia, ou o deixa na fila com motivo. */
async function routeLeadTx(
  tx: Tx,
  lead: Lead,
  { assignedByMemberId = null, excludeMemberIds = [], fallbackQueueReason, reason }:
    { assignedByMemberId?: string | null; excludeMemberIds?: string[]; fallbackQueueReason?: string; reason?: string } = {}
) {
  const [listing, organization] = await Promise.all([
    tx.listing.findUnique({ where: { id: lead.listingId }, select: { id: true, agentId: true, buildingId: true } }),
    tx.organization.findUnique({ where: { id: lead.organizationId }, select: { id: true, leadDistributionMode: true } }),
  ]);
  const assignee = listing && organization ? await resolveLeadAssignee(listing, organization, { tx, excludeMemberIds }) : null;
  if (assignee) {
    await assignLeadTx(tx, { lead, brokerMemberId: assignee.memberId, assignedByMemberId, source: assignee.source, reason });
    return assignee;
  }
  const queueReason = fallbackQueueReason ?? (organization?.leadDistributionMode === 'ROUND_ROBIN' ? 'NO_ELIGIBLE' : 'MANUAL_MODE');
  await unassignLeadTx(tx, lead, { reason: reason ?? 'Sem destinatário elegível.', queueReason });
  return null;
}

/** Compatibilidade: distribui um lead já criado (scripts). */
export async function distributeLead(lead: Lead): Promise<void> {
  await withRetry(() =>
    prisma.$transaction(async (tx) => {
      const locked = await lockLead(tx, lead.id);
      if (!locked || (await getCurrentAssignment(lead.id, tx))) return;
      await routeLeadTx(tx, locked);
    })
  );
}

export type EnsureLeadOptions = {
  userId: string;
  listingId: string;
  organizationId: string;
  source?: string;
  /** ENTRY normal; INTENT para clique em canal externo (não confirma atendimento). */
  kind?: 'ENTRY' | 'INTENT';
  /** false = só garante o lead, sem registrar nova entrada (ex.: reabrir uma conversa já existente). */
  recordEntry?: boolean;
  note?: string | undefined;
  createdByMemberId?: string | null;
  /** Membro preferido para a 1ª atribuição (ex.: corretor que registrou o contato), se elegível. */
  preferredMemberId?: string | null;
};

/**
 * Ponto único de criação de Lead (seção 22/23 da spec). Numa única transação: recupera ou cria o
 * lead (1 cliente + 1 imóvel = 1 Lead), registra a entrada, decide o encaminhamento, consome o turno
 * do rodízio e grava a atribuição — um erro no meio desfaz tudo, então nunca sobra lead novo sem
 * destino decidido. Corrida na criação (P2002) ou conflito transitório: repete e reaproveita.
 * Lead existente mantém o responsável atual; se estava encerrado, a entrada vira REENTRY.
 */
export async function ensureLeadDetailed(opts: EnsureLeadOptions): Promise<{ lead: Lead; created: boolean }> {
  const { userId, listingId, organizationId, source = 'CHAT', kind = 'ENTRY', recordEntry = true } = opts;
  return withRetry(() =>
    prisma.$transaction(async (tx) => {
      const existing = await tx.lead.findUnique({ where: { userId_listingId: { userId, listingId } } });
      if (existing) {
        if (!recordEntry) return { lead: existing, created: false };
        await tx.leadEntry.create({
          data: {
            leadId: existing.id,
            source,
            kind: kind === 'INTENT' ? 'INTENT' : isClosedStatus(existing.status) ? 'REENTRY' : 'ENTRY',
            previousStatus: existing.status,
            note: opts.note ?? null,
            createdById: opts.createdByMemberId ?? null,
          },
        });
        const lead = await tx.lead.update({ where: { id: existing.id }, data: { lastActivityAt: new Date() } });
        return { lead, created: false };
      }

      const lead = await tx.lead.create({ data: { userId, listingId, organizationId, source } });
      await tx.leadEntry.create({
        data: { leadId: lead.id, source, kind, note: opts.note ?? null, createdById: opts.createdByMemberId ?? null },
      });

      let routed = false;
      if (opts.preferredMemberId) {
        const preferred = await tx.organizationMember.findUnique({ where: { id: opts.preferredMemberId } });
        if (leadEligibilityProblem(preferred, organizationId) === null) {
          await assignLeadTx(tx, { lead, brokerMemberId: preferred!.id, assignedByMemberId: preferred!.id, source: 'SELF_ASSIGNED' });
          routed = true;
        }
      }
      if (!routed) await routeLeadTx(tx, lead);
      return { lead: await tx.lead.findUniqueOrThrow({ where: { id: lead.id } }), created: true };
    })
  );
}

export async function ensureLead(opts: EnsureLeadOptions): Promise<Lead> {
  return (await ensureLeadDetailed(opts)).lead;
}

export type TransferLeadResult =
  | { ok: true; assignment: { id: string; brokerId: string; assignedAt: Date }; changed: boolean }
  | { ok: false; reason: 'LEAD_NOT_FOUND' | 'REASON_REQUIRED' | EligibilityProblem };

/**
 * Atribuição manual / transferência / assumir da fila. Serializada por lead (trava a linha),
 * revalida o destino no momento da escrita e é idempotente para a mesma pessoa. Transferência
 * (já havia responsável) exige motivo. `moveOpenWork` leva tarefas pendentes e visitas futuras.
 */
export async function transferLead({
  leadId,
  toMemberId,
  changedByMemberId,
  reason,
  moveOpenWork = false,
  source,
}: {
  leadId: string;
  toMemberId: string;
  changedByMemberId: string;
  reason?: string | undefined;
  moveOpenWork?: boolean;
  source?: LeadAssignmentSource;
}): Promise<TransferLeadResult> {
  return withRetry(() =>
    prisma.$transaction(async (tx): Promise<TransferLeadResult> => {
      const lead = await lockLead(tx, leadId);
      if (!lead) return { ok: false, reason: 'LEAD_NOT_FOUND' };

      const member = await tx.organizationMember.findUnique({ where: { id: toMemberId } });
      const problem = leadEligibilityProblem(member, lead.organizationId);
      if (problem) return { ok: false, reason: problem };

      const current = await getCurrentAssignment(leadId, tx);
      if (current && current.brokerId !== toMemberId && !reason?.trim()) return { ok: false, reason: 'REASON_REQUIRED' };

      const result = await assignLeadTx(tx, {
        lead,
        brokerMemberId: toMemberId,
        assignedByMemberId: changedByMemberId,
        reason: reason?.trim() || undefined,
        source: source ?? (current ? 'TRANSFER' : 'MANUAL'),
        moveOpenWork,
      });
      return { ok: true, assignment: result.assignment, changed: result.changed };
    })
  );
}

/** O que muda ao transferir: tarefas pendentes, visitas futuras e conversas do lead. */
export async function getTransferImpact(leadId: string) {
  const current = await getCurrentAssignment(leadId);
  const [pendingTasks, futureVisits, conversations] = await Promise.all([
    prisma.leadTask.count({ where: { leadId, completedAt: null } }),
    prisma.visit.count({ where: { leadId, scheduledAt: { gte: new Date() }, status: { in: ['SCHEDULED', 'CONFIRMED'] } } }),
    prisma.conversation.count({ where: { leadId } }),
  ]);
  return { currentBrokerId: current?.brokerId ?? null, pendingTasks, futureVisits, conversations };
}

/**
 * Regra de permissão única para MUTAÇÃO: OWNER/ADMIN/MANAGER agem em qualquer lead da própria
 * organização; BROKER só no lead atualmente atribuído a si. ASSISTANT nunca muta.
 */
export async function resolveLeadAccess(userId: string, lead: { id: string; organizationId: string }) {
  const membership = await getMembership(userId);
  if (!membership || membership.organizationId !== lead.organizationId || membership.status !== 'ACTIVE') return null;

  if ((LEAD_MANAGE_ROLES as readonly string[]).includes(membership.role)) return membership;
  if (membership.role !== 'BROKER') return null;

  const current = await getCurrentAssignment(lead.id);
  if (!current || current.brokerId !== membership.id) return null;
  return membership;
}

/** Regra de LEITURA: igual a `resolveLeadAccess`, mas ASSISTANT lê qualquer lead da organização. */
export async function canViewLeadAccess(userId: string, lead: { id: string; organizationId: string }) {
  const membership = await getMembership(userId);
  if (!membership || membership.organizationId !== lead.organizationId || membership.status !== 'ACTIVE') return null;

  const canViewAny = ['OWNER', 'ADMIN', 'MANAGER', 'ASSISTANT'].includes(membership.role);
  if (canViewAny) return membership;

  const current = await getCurrentAssignment(lead.id);
  if (!current || current.brokerId !== membership.id) return null;
  return membership;
}

/**
 * Quem pode agir do "lado do anúncio" numa conversa/reserva/proposta. Imóvel de pessoa física: só
 * o `ownerId`. Imóvel de organização: mesma regra de `resolveLeadAccess` sobre o lead do cliente.
 */
export async function canManageListingConversation(
  userId: string,
  listing: { id: string; ownerId: string | null; organizationId: string | null },
  customerIds: string[]
): Promise<boolean> {
  if (listing.ownerId) return listing.ownerId === userId;
  if (!listing.organizationId) return false;

  const lead = await prisma.lead.findFirst({
    where: { listingId: listing.id, organizationId: listing.organizationId, userId: { in: customerIds } },
  });
  if (!lead) return false;
  return !!(await resolveLeadAccess(userId, lead));
}

export type TransitionProblem =
  | 'NO_LEAD'
  | 'ALREADY_THERE'
  | 'CONFLICT'
  | 'REOPEN_REQUIRED'
  | 'NOT_CLOSED'
  | 'LOST_REASON_REQUIRED'
  | 'NOT_FORWARD';

/**
 * Transição central de etapa (mapeamento CRM, seção 7 P1) — Kanban, ficha, chat e integrações
 * passam por aqui. Trava o lead, confere etapa esperada (`expectedStatus` → CONFLICT), exige motivo
 * para LOST, impede sair de WON/LOST sem a ação explícita de reabrir, grava desfecho/autoria e
 * registra a mudança com autor e referência. Nunca marca 1ª resposta (etapa não é contato).
 */
export async function transitionLead({
  leadId,
  to,
  actorMemberId,
  expectedStatus,
  lostReason,
  lostNote,
  note,
  reopen = false,
  forwardOnly = false,
}: {
  leadId: string;
  to: string;
  actorMemberId: string | null;
  expectedStatus?: string | undefined;
  lostReason?: string | undefined;
  lostNote?: string | undefined;
  note?: string | undefined;
  reopen?: boolean;
  forwardOnly?: boolean;
}): Promise<{ ok: true; lead: Lead } | { ok: false; reason: TransitionProblem }> {
  return withRetry(() =>
    prisma.$transaction(async (tx) => {
      const lead = await lockLead(tx, leadId);
      if (!lead) return { ok: false as const, reason: 'NO_LEAD' as const };
      if (expectedStatus && lead.status !== expectedStatus) return { ok: false as const, reason: 'CONFLICT' as const };
      if (lead.status === to) return { ok: false as const, reason: 'ALREADY_THERE' as const };

      const wasClosed = isClosedStatus(lead.status);
      const willClose = isClosedStatus(to);
      if (reopen && !wasClosed) return { ok: false as const, reason: 'NOT_CLOSED' as const };
      if (wasClosed && !willClose && !reopen) return { ok: false as const, reason: 'REOPEN_REQUIRED' as const };
      if (forwardOnly) {
        if (wasClosed) return { ok: false as const, reason: 'NOT_FORWARD' as const };
        const order = LEAD_STATUSES as readonly string[];
        if (to !== 'LOST' && order.indexOf(to) <= order.indexOf(lead.status)) return { ok: false as const, reason: 'NOT_FORWARD' as const };
      }
      if (to === 'LOST' && !(lostReason && lostReason in LOST_REASONS)) {
        return { ok: false as const, reason: 'LOST_REASON_REQUIRED' as const };
      }

      const now = new Date();
      const updated = await tx.lead.update({
        where: { id: leadId },
        data: {
          status: to,
          lastActivityAt: now,
          ...(willClose
            ? {
                closedAt: now,
                closedById: actorMemberId,
                lostReason: to === 'LOST' ? lostReason! : null,
                lostNote: to === 'LOST' ? lostNote?.trim() || null : null,
                queuedAt: null,
                queueReason: null,
              }
            : {}),
          ...(wasClosed && !willClose
            ? { closedAt: null, closedById: null, lostReason: null, lostNote: null, reopenedAt: now }
            : {}),
        },
      });

      const current = await getCurrentAssignment(leadId, tx);
      const logMemberId = actorMemberId ?? current?.brokerId ?? null;
      if (logMemberId) {
        const reasonLabel = to === 'LOST' ? ` · ${LOST_REASONS[lostReason as LostReason]}` : '';
        await tx.leadInteraction.create({
          data: {
            leadId,
            memberId: logMemberId,
            type: wasClosed && !willClose ? 'REOPEN' : 'STATUS_CHANGE',
            content: `${lead.status} → ${to}${reasonLabel}${note ? ` (${note})` : ''}`,
          },
        });
      }

      // Retomada: o atendimento volta para quem pode atender agora. Responsável atual ainda
      // elegível continua; se saiu/pausou, a oportunidade segue a hierarquia ou entra na fila.
      if (wasClosed && !willClose) {
        const holder = current ? await tx.organizationMember.findUnique({ where: { id: current.brokerId } }) : null;
        const holderOk = holder && holder.status === 'ACTIVE' && (LEAD_DISTRIBUTION_ROLES as readonly string[]).includes(holder.role);
        if (!holderOk) {
          await routeLeadTx(tx, updated, {
            assignedByMemberId: actorMemberId,
            excludeMemberIds: holder ? [holder.id] : [],
            fallbackQueueReason: 'REOPENED',
            reason: 'Oportunidade reaberta.',
          });
        }
      }
      return { ok: true as const, lead: await tx.lead.findUniqueOrThrow({ where: { id: leadId } }) };
    })
  );
}

export type LeadTransitionResult =
  | { ok: true }
  | { ok: false; reason: 'NOT_ORG_LISTING' | 'NO_LEAD' | 'ALREADY_THERE' | 'FORBIDDEN' | TransitionProblem };

/** Acha o lead do cliente entre os participantes, confere permissão e aplica a transição central. */
async function transitionLeadForListing(
  userId: string,
  listing: { id: string; organizationId: string | null },
  participantIds: string[],
  status: string,
  note: string
): Promise<LeadTransitionResult> {
  if (!listing.organizationId) return { ok: false, reason: 'NOT_ORG_LISTING' };

  const lead = await prisma.lead.findFirst({
    where: { listingId: listing.id, organizationId: listing.organizationId, userId: { in: participantIds } },
  });
  if (!lead) return { ok: false, reason: 'NO_LEAD' };
  if (lead.status === status) return { ok: false, reason: 'ALREADY_THERE' };

  const membership = await resolveLeadAccess(userId, lead);
  if (!membership) return { ok: false, reason: 'FORBIDDEN' };

  const result = await transitionLead({ leadId: lead.id, to: status, actorMemberId: membership.id, note });
  return result.ok ? { ok: true } : { ok: false, reason: result.reason };
}

/**
 * Negócio fechado pelo produto (reserva aprovada, negociação aceita) → Ganho. A recusa de uma
 * rodada ou reserva NÃO encerra a oportunidade: fica como atividade enquanto o cliente pode seguir.
 */
export async function closeLeadForDealOutcome(
  userId: string,
  listing: { id: string; organizationId: string | null },
  customerId: string,
  outcome: 'WON'
): Promise<void> {
  await transitionLeadForListing(userId, listing, [customerId], outcome, 'automático: reserva aprovada');
}

/** Comando de chat `/negociar` — mesma transição central, com permissão de quem opera o lead. */
export async function moveLeadToNegotiationFromChatCommand(
  userId: string,
  listing: { id: string; organizationId: string | null },
  participantIds: string[]
): Promise<LeadTransitionResult> {
  return transitionLeadForListing(userId, listing, participantIds, 'NEGOTIATION', 'via comando de chat "/negociar"');
}

/**
 * Avanço automático por evento do sistema (rodadas de negociação, aceite). Só anda pra frente,
 * nunca mexe em WON/LOST, autoria = sistema (log no nome do responsável atual, se houver).
 */
export async function advanceLeadBySystem(leadId: string, status: string, note: string): Promise<void> {
  await transitionLead({ leadId, to: status, actorMemberId: null, note: `automático: ${note}`, forwardOnly: true });
}

/** Preenche a 1ª resposta efetiva da atribuição aberta (uma vez por atribuição). */
export async function markFirstResponse(leadId: string, channel: string, at = new Date()): Promise<void> {
  await prisma.leadAssignment.updateMany({
    where: { leadId, unassignedAt: null, firstContactAt: null },
    data: { firstContactAt: at, firstContactChannel: channel },
  });
}

/**
 * Registra uma interação da equipe. Só conta como 1ª resposta o contato efetivo por canal
 * externo (ligação, WhatsApp, e-mail, visita) com desfecho CONTACT — nota e tentativa não contam.
 */
export async function recordInteraction({
  leadId,
  memberId,
  type,
  content,
  outcome,
}: {
  leadId: string;
  memberId: string;
  type: string;
  content?: string | undefined;
  outcome?: 'CONTACT' | 'ATTEMPT' | undefined;
}) {
  const isChannel = RESPONSE_CHANNELS.includes(type);
  const effectiveOutcome = isChannel ? outcome ?? 'CONTACT' : null;
  const interaction = await prisma.leadInteraction.create({
    data: { leadId, memberId, type, content: content ?? null, outcome: effectiveOutcome },
  });
  await prisma.lead.update({ where: { id: leadId }, data: { lastActivityAt: interaction.createdAt } });
  if (isChannel && effectiveOutcome === 'CONTACT') await markFirstResponse(leadId, type, interaction.createdAt);
  return interaction;
}

/**
 * Mensagem humana no chat de uma conversa com lead: atualiza a última atividade; se quem enviou é
 * da equipe da imobiliária (não o cliente), conta como 1ª resposta; se é o cliente voltando a um
 * lead perdido, registra uma reentrada (uma por encerramento). Melhor esforço — nunca lança.
 */
export async function recordChatMessageActivity(leadId: string | null, senderId: string, at = new Date()): Promise<void> {
  if (!leadId) return;
  try {
    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) return;
    await prisma.lead.update({ where: { id: leadId }, data: { lastActivityAt: at } });
    if (senderId === lead.userId) {
      if (lead.status === 'LOST') {
        const since = lead.closedAt ?? lead.updatedAt;
        const already = await prisma.leadEntry.count({ where: { leadId, kind: 'REENTRY', createdAt: { gte: since } } });
        if (!already) await prisma.leadEntry.create({ data: { leadId, source: 'CHAT', kind: 'REENTRY', previousStatus: 'LOST' } });
      }
      return;
    }
    const sender = await getMembership(senderId);
    if (sender && sender.organizationId === lead.organizationId && sender.status === 'ACTIVE') {
      await markFirstResponse(leadId, 'CHAT', at);
    }
  } catch (err) {
    console.error('Falha ao registrar atividade de chat no lead:', err);
  }
}

/**
 * Saída de um integrante: planeja e aplica, numa transação única com a inativação, o destino de
 * cada atribuição aberta. Oportunidades em andamento seguem a hierarquia (sem o integrante que sai)
 * ou vão para a fila da gestão — nunca para alguém pausado. Encerradas preservam a atribuição de
 * encerramento para histórico (a retomada redistribui, ver `transitionLead`). Reexecutar é seguro:
 * se algo falhar, nada muda.
 */
export async function planAndApplyMemberDeparture(
  tx: Tx,
  { departing, actorMemberId }: { departing: OrganizationMember; actorMemberId: string }
) {
  const open = await tx.leadAssignment.findMany({
    where: { brokerId: departing.id, unassignedAt: null },
    select: { lead: true },
  });
  const plan: { leadId: string; outcome: 'KEPT_CLOSED' | 'REASSIGNED' | 'QUEUED'; toMemberId?: string; rule?: string }[] = [];
  for (const { lead } of open) {
    await lockLead(tx, lead.id);
    if (isClosedStatus(lead.status)) {
      plan.push({ leadId: lead.id, outcome: 'KEPT_CLOSED' });
      continue;
    }
    const assignee = await routeLeadTx(tx, lead, {
      assignedByMemberId: actorMemberId,
      excludeMemberIds: [departing.id],
      fallbackQueueReason: 'MEMBER_REMOVED',
      reason: 'Integrante removido da organização.',
    });
    if (assignee) {
      // Tarefas pendentes e visitas futuras acompanham a carteira.
      await tx.leadTask.updateMany({
        where: { leadId: lead.id, completedAt: null, OR: [{ assigneeId: departing.id }, { assigneeId: null, memberId: departing.id }] },
        data: { assigneeId: assignee.memberId },
      });
      await tx.visit.updateMany({
        where: { leadId: lead.id, brokerId: departing.id, scheduledAt: { gte: new Date() }, status: { in: ['SCHEDULED', 'CONFIRMED'] } },
        data: { brokerId: assignee.memberId },
      });
      plan.push({ leadId: lead.id, outcome: 'REASSIGNED', toMemberId: assignee.memberId, rule: assignee.source });
    } else {
      plan.push({ leadId: lead.id, outcome: 'QUEUED' });
    }
  }
  return plan;
}

// ─── SLA — derivado de assignedAt/firstContactAt, nunca persistido ─────────────────────────────

export const SLA_AT_RISK_HOURS = 3;
export const SLA_OVERDUE_HOURS = 4;

export type SlaStatus = 'UNASSIGNED' | 'PENDING' | 'AT_RISK' | 'OVERDUE' | 'RESPONDED_ON_TIME' | 'RESPONDED_LATE' | 'CLOSED';

export function computeSlaStatus(
  assignment: { assignedAt: Date; firstContactAt: Date | null } | null | undefined,
  leadStatus?: string
): SlaStatus {
  if (assignment?.firstContactAt) {
    const hours = (assignment.firstContactAt.getTime() - assignment.assignedAt.getTime()) / 3_600_000;
    return hours <= SLA_OVERDUE_HOURS ? 'RESPONDED_ON_TIME' : 'RESPONDED_LATE';
  }
  if (leadStatus && isClosedStatus(leadStatus)) return 'CLOSED';
  if (!assignment) return 'UNASSIGNED';

  const hoursElapsed = (Date.now() - assignment.assignedAt.getTime()) / 3_600_000;
  if (hoursElapsed >= SLA_OVERDUE_HOURS) return 'OVERDUE';
  if (hoursElapsed >= SLA_AT_RISK_HOURS) return 'AT_RISK';
  return 'PENDING';
}

/** Percentil simples (nearest-rank) para métricas de tempo. */
export function percentile(values: number[], p: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx]!;
}
