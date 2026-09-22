import { Prisma, type Lead, type Organization, type OrganizationMember } from '@prisma/client';
import { prisma } from './prisma.js';
import { getMembership } from './organizations.js';

// Papéis elegíveis para receber leads (distribuição automática e atribuição manual) — Corretor,
// Gerente e também o OWNER (seções 12/13 da spec: ser dono da organização não impede de vender).
// ADMIN/ASSISTANT gerenciam o CRM mas não entram na distribuição por padrão.
export const LEAD_DISTRIBUTION_ROLES = ['OWNER', 'MANAGER', 'BROKER'] as const;

// Origem de uma atribuição — seção 32 da spec. Guardado em LeadAssignment.source pra métricas/auditoria.
export type LeadAssignmentSource =
  | 'BUILDING_OWNER'
  | 'LISTING_AGENT'
  | 'ROUND_ROBIN'
  | 'MANUAL'
  | 'SELF_ASSIGNED'
  | 'TRANSFER'
  | 'BACKUP';

function isEligibleForLeads(
  member: { role: string; status: string; receiveLeads: boolean } | null | undefined
): member is { role: string; status: string; receiveLeads: boolean } {
  return (
    !!member &&
    member.status === 'ACTIVE' &&
    member.receiveLeads &&
    (LEAD_DISTRIBUTION_ROLES as readonly string[]).includes(member.role)
  );
}

export function getCurrentAssignment(leadId: string) {
  return prisma.leadAssignment.findFirst({
    where: { leadId, unassignedAt: null },
    orderBy: { assignedAt: 'desc' },
  });
}

/**
 * Nunca sobrescreve: fecha a atribuição aberta (se houver) e cria uma nova — histórico
 * completo preservado (decisão fechada em docs/crm-b2b-organizacoes-leads.md). As duas escritas
 * vão numa `$transaction` — antes eram awaits separados, o que podia deixar o lead sem nenhuma
 * atribuição aberta se o processo caísse entre as duas.
 *
 * Também sincroniza quem consegue falar com o cliente no chat (Conversation.participants):
 * antes, o 2º participante ficava travado em `listing.agentId`/`ownerId` pra sempre, então
 * reatribuir o lead nunca dava acesso de chat pra quem passava a ser responsável de fato — ver
 * `syncConversationParticipant` abaixo.
 */
export async function assignLead({
  lead,
  brokerMemberId,
  brokerUserId,
  assignedByMemberId,
  reason,
  source,
}: {
  lead: { id: string; userId: string; listingId: string };
  brokerMemberId: string;
  brokerUserId: string;
  assignedByMemberId: string | null;
  reason?: string | undefined;
  source?: LeadAssignmentSource | undefined;
}) {
  const current = await getCurrentAssignment(lead.id);

  const ops = [];
  if (current) {
    ops.push(
      prisma.leadAssignment.update({
        where: { id: current.id },
        data: { unassignedAt: new Date(), reason: reason ?? null },
      })
    );
  }
  ops.push(
    prisma.leadAssignment.create({
      data: { leadId: lead.id, brokerId: brokerMemberId, assignedBy: assignedByMemberId, source: source ?? null },
    })
  );
  const results = await prisma.$transaction(ops);
  const assignment = results[results.length - 1]!;

  try {
    await syncConversationParticipant({
      listingId: lead.listingId,
      customerId: lead.userId,
      newBrokerUserId: brokerUserId,
    });
  } catch (err) {
    // Aditivo — nunca derruba a atribuição do lead se a sincronização do chat falhar.
    console.error('Falha ao sincronizar participante da conversa após atribuição de lead:', err);
  }

  return assignment;
}

/**
 * Garante que quem consegue ler/responder a conversa do cliente (imóvel, lead) seja sempre o
 * corretor atualmente responsável — remove qualquer outro participante que não seja o cliente
 * nem o novo corretor (cobre tanto a 1ª atribuição, que troca quem criou o anúncio, quanto uma
 * reatribuição, que troca o corretor anterior). No-op se o cliente ainda não abriu conversa.
 */
async function syncConversationParticipant({
  listingId,
  customerId,
  newBrokerUserId,
}: {
  listingId: string;
  customerId: string;
  newBrokerUserId: string;
}): Promise<void> {
  if (newBrokerUserId === customerId) return;

  const conversation = await prisma.conversation.findFirst({
    where: { propertyId: listingId, participants: { some: { id: customerId } } },
    include: { participants: { select: { id: true } } },
  });
  if (!conversation) return;

  const stale = conversation.participants.filter((p) => p.id !== customerId && p.id !== newBrokerUserId);
  const alreadyIn = conversation.participants.some((p) => p.id === newBrokerUserId);
  if (!stale.length && alreadyIn) return;

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: {
      participants: {
        ...(stale.length ? { disconnect: stale.map((p) => ({ id: p.id })) } : {}),
        ...(alreadyIn ? {} : { connect: { id: newBrokerUserId } }),
      },
    },
  });
}

/**
 * Round Robin real (seção 19/20 da spec) — não é mais `Math.random()`. `Organization.leadRoundRobinCursor`
 * guarda o id do último membro que recebeu um lead; o próximo é o seguinte na lista ordenada de
 * elegíveis (ordem estável por `createdAt`, com `id` como desempate).
 *
 * Concorrência: dois leads podem chegar ao mesmo tempo. `SELECT ... FOR UPDATE` trava a linha da
 * Organization dentro da transação — a segunda chamada só lê o cursor depois que a primeira já o
 * atualizou e commitou, então nunca escolhem o mesmo próximo membro (seção 20).
 */
export async function pickRoundRobinMember(organizationId: string): Promise<OrganizationMember | null> {
  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ id: string; leadRoundRobinCursor: string | null }[]>`
      SELECT "id", "leadRoundRobinCursor" FROM "Organization" WHERE "id" = ${organizationId} FOR UPDATE
    `;
    if (!locked[0]) return null;

    const eligible = await tx.organizationMember.findMany({
      where: {
        organizationId,
        role: { in: LEAD_DISTRIBUTION_ROLES as unknown as string[] },
        status: 'ACTIVE',
        receiveLeads: true,
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    if (eligible.length === 0) return null;

    const cursorIdx = locked[0].leadRoundRobinCursor
      ? eligible.findIndex((m) => m.id === locked[0]!.leadRoundRobinCursor)
      : -1;
    const chosen = eligible[(cursorIdx + 1) % eligible.length]!;

    await tx.organization.update({ where: { id: organizationId }, data: { leadRoundRobinCursor: chosen.id } });
    return chosen;
  });
}

/**
 * Hierarquia de distribuição de um lead novo (seção 15 da spec):
 * 1. Lead Owner do empreendimento do imóvel (`OrganizationBuilding.leadOwnerMemberId`).
 * 2. Backup do empreendimento, se o Lead Owner não estiver elegível (seção 16/17).
 * 3. Responsável comercial do imóvel (`Listing.agentId`).
 * 4. Distribuição da organização (Round Robin, só se `leadDistributionMode === 'ROUND_ROBIN'`).
 * 5. Sem destino automático — fica `Unassigned`, alguém com OWNER/ADMIN/MANAGER atribui manualmente.
 *
 * Em todos os passos, "elegível" significa `status = ACTIVE`, `role` em `LEAD_DISTRIBUTION_ROLES`
 * e `receiveLeads = true` (seção 15, nota final) — nunca ignorado, nem para o Lead Owner.
 */
export async function resolveLeadAssignee(
  listing: { id: string; agentId: string | null; buildingId: string | null },
  organization: Organization
): Promise<{ memberId: string; userId: string; source: LeadAssignmentSource } | null> {
  if (listing.buildingId) {
    const building = await prisma.organizationBuilding.findUnique({
      where: { id: listing.buildingId },
      include: { leadOwner: true, backupMember: true },
    });
    if (building) {
      if (isEligibleForLeads(building.leadOwner)) {
        return { memberId: building.leadOwner!.id, userId: building.leadOwner!.userId, source: 'BUILDING_OWNER' };
      }
      if (isEligibleForLeads(building.backupMember)) {
        return { memberId: building.backupMember!.id, userId: building.backupMember!.userId, source: 'BACKUP' };
      }
    }
  }

  if (listing.agentId) {
    const agentMembership = await prisma.organizationMember.findUnique({ where: { userId: listing.agentId } });
    if (agentMembership && agentMembership.organizationId === organization.id && isEligibleForLeads(agentMembership)) {
      return { memberId: agentMembership.id, userId: agentMembership.userId, source: 'LISTING_AGENT' };
    }
  }

  if (organization.leadDistributionMode === 'ROUND_ROBIN') {
    const chosen = await pickRoundRobinMember(organization.id);
    if (chosen) return { memberId: chosen.id, userId: chosen.userId, source: 'ROUND_ROBIN' };
  }

  return null;
}

/**
 * Aplica a hierarquia de `resolveLeadAssignee` a um Lead recém-criado. No-op (Lead fica
 * Unassigned) se nada elegível for encontrado — nunca lança erro, distribuição automática é
 * sempre best-effort (o painel do CRM permite atribuição manual depois).
 */
export async function distributeLead(lead: Lead, organization: Organization): Promise<void> {
  const listing = await prisma.listing.findUnique({
    where: { id: lead.listingId },
    select: { id: true, agentId: true, buildingId: true },
  });
  if (!listing) return;

  const assignee = await resolveLeadAssignee(listing, organization);
  if (!assignee) return;

  await assignLead({
    lead,
    brokerMemberId: assignee.memberId,
    brokerUserId: assignee.userId,
    assignedByMemberId: null,
    source: assignee.source,
  });
}

/**
 * Ponto único de criação de Lead (seção 22/23 da spec) — chat, booking, offer e qualquer fluxo
 * futuro devem passar por aqui, nunca criar `prisma.lead.create` diretamente. Garante "1 cliente +
 * 1 imóvel = 1 Lead" (seção 21): se já existir, reaproveita; se duas requests concorrentes
 * tentarem criar ao mesmo tempo, a constraint única do banco rejeita a segunda e ela recupera o
 * Lead que a primeira acabou de criar (seção 163 — teste de duplicidade).
 */
export async function ensureLead({
  userId,
  listingId,
  organizationId,
  source = 'CHAT',
}: {
  userId: string;
  listingId: string;
  organizationId: string;
  source?: string;
}): Promise<Lead> {
  const existing = await prisma.lead.findUnique({ where: { userId_listingId: { userId, listingId } } });
  if (existing) return existing;

  try {
    const lead = await prisma.lead.create({ data: { userId, listingId, organizationId, source } });
    const organization = await prisma.organization.findUnique({ where: { id: organizationId } });
    if (organization) await distributeLead(lead, organization);
    return lead;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const raceWinner = await prisma.lead.findUnique({ where: { userId_listingId: { userId, listingId } } });
      if (raceWinner) return raceWinner;
    }
    throw err;
  }
}

export type TransferLeadResult =
  | { ok: true; assignment: Awaited<ReturnType<typeof assignLead>> }
  | {
      ok: false;
      reason: 'LEAD_NOT_FOUND' | 'MEMBER_NOT_IN_ORG' | 'MEMBER_INACTIVE' | 'MEMBER_INELIGIBLE_ROLE' | 'MEMBER_NOT_RECEIVING_LEADS';
    };

/**
 * Serviço central de transferência/atribuição manual de Lead (seção 28 da spec) — substitui
 * validação duplicada nos handlers. Aplica as mesmas checagens em qualquer chamador: lead existe,
 * novo membro pertence à organização, está ACTIVE, tem papel elegível e pode receber leads
 * (`receiveLeads = true`). `source` vira `TRANSFER` se o lead já tinha responsável, ou `MANUAL`
 * se estava sem ninguém (primeira atribuição pelo painel).
 */
export async function transferLead({
  leadId,
  toMemberId,
  changedByMemberId,
  reason,
}: {
  leadId: string;
  toMemberId: string;
  changedByMemberId: string;
  reason?: string | undefined;
}): Promise<TransferLeadResult> {
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) return { ok: false, reason: 'LEAD_NOT_FOUND' };

  const member = await prisma.organizationMember.findUnique({ where: { id: toMemberId } });
  if (!member || member.organizationId !== lead.organizationId) return { ok: false, reason: 'MEMBER_NOT_IN_ORG' };
  if (member.status !== 'ACTIVE') return { ok: false, reason: 'MEMBER_INACTIVE' };
  if (!(LEAD_DISTRIBUTION_ROLES as readonly string[]).includes(member.role)) {
    return { ok: false, reason: 'MEMBER_INELIGIBLE_ROLE' };
  }
  if (!member.receiveLeads) return { ok: false, reason: 'MEMBER_NOT_RECEIVING_LEADS' };

  const previousAssignment = await getCurrentAssignment(leadId);

  const assignment = await assignLead({
    lead,
    brokerMemberId: member.id,
    brokerUserId: member.userId,
    assignedByMemberId: changedByMemberId,
    reason,
    source: previousAssignment ? 'TRANSFER' : 'MANUAL',
  });

  return { ok: true, assignment };
}

/**
 * Regra de permissão única, reaproveitada por todo handler que age sobre um Lead (Fase 3):
 * OWNER/ADMIN/MANAGER agem em qualquer lead da própria organização; BROKER só no lead
 * atualmente atribuído a si (via `getCurrentAssignment`). Retorna a membership de quem pode
 * agir, ou `null` se não puder — quem chama decide 403 vs 404 conforme o contexto.
 */
export async function resolveLeadAccess(userId: string, lead: { id: string; organizationId: string }) {
  const membership = await getMembership(userId);
  if (!membership || membership.organizationId !== lead.organizationId || membership.status !== 'ACTIVE') return null;

  const canManageAny = ['OWNER', 'ADMIN', 'MANAGER'].includes(membership.role);
  if (canManageAny) return membership;

  const current = await getCurrentAssignment(lead.id);
  if (!current || current.brokerId !== membership.id) return null;
  return membership;
}

/**
 * Regra de visualização (Fase de papel ASSISTANT) — igual a `resolveLeadAccess`, mas também deixa
 * `ASSISTANT` ver qualquer lead da própria organização (somente leitura, nunca usada por handlers
 * de mutação). `updateLeadStatusHandler`/interações/visitas continuam usando `resolveLeadAccess`.
 */
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
 * Quem pode agir do "lado do anúncio" numa conversa/reserva/proposta — usada por
 * `bookings.controller.ts`/`offers.controller.ts` (aprovar/recusar) e por `getConversation`
 * (pra dizer ao front se o viewer atual pode ver os botões de ação). Imóvel de pessoa física:
 * só o `ownerId`. Imóvel de organização: `ownerId` é sempre `null` (nunca bate), então cai na
 * mesma regra de `resolveLeadAccess` — OWNER/ADMIN/MANAGER da organização, ou o corretor
 * atualmente responsável pelo Lead do cliente. Sem isso, ninguém nunca conseguia aprovar
 * reserva/proposta em imóvel de organização (bug pré-existente: o check antigo comparava contra
 * `ownerId`, que não existe pra esse tipo de imóvel), e reatribuir o Lead pro CRM não passava
 * essa autoridade adiante pro novo corretor.
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

export type LeadTransitionResult =
  | { ok: true }
  | { ok: false; reason: 'NOT_ORG_LISTING' | 'NO_LEAD' | 'ALREADY_THERE' | 'FORBIDDEN' };

/**
 * Núcleo de toda mudança de status de Lead disparada fora do painel `/imobiliaria` (aprovação
 * automática de reserva/proposta, comandos de chat) — acha o Lead entre os participantes dados,
 * confere permissão (`resolveLeadAccess`, mesma regra de sempre) e loga a mudança como
 * `STATUS_CHANGE`, igual ao que `updateLeadStatusHandler` já faz manualmente pelo Kanban. O motivo
 * do no-op vem tipado (`reason`) pra quem chama poder dar um feedback específico (o comando de
 * chat usa isso; `closeLeadForDealOutcome` ignora, já que é sempre "melhor esforço").
 */
async function transitionLeadStatus(
  userId: string,
  listing: { id: string; organizationId: string | null },
  participantIds: string[],
  status: string,
  logSuffix: string
): Promise<LeadTransitionResult> {
  if (!listing.organizationId) return { ok: false, reason: 'NOT_ORG_LISTING' };

  const lead = await prisma.lead.findFirst({
    where: { listingId: listing.id, organizationId: listing.organizationId, userId: { in: participantIds } },
  });
  if (!lead) return { ok: false, reason: 'NO_LEAD' };
  if (lead.status === status) return { ok: false, reason: 'ALREADY_THERE' };

  const membership = await resolveLeadAccess(userId, lead);
  if (!membership) return { ok: false, reason: 'FORBIDDEN' };

  const previousStatus = lead.status;
  await prisma.lead.update({ where: { id: lead.id }, data: { status } });
  await recordInteraction({
    leadId: lead.id,
    memberId: membership.id,
    type: 'STATUS_CHANGE',
    content: `${previousStatus} → ${status} (${logSuffix})`,
  });
  return { ok: true };
}

/**
 * Move o Lead do cliente automaticamente pro fim do funil (`WON` numa reserva/proposta aprovada,
 * `LOST` numa recusada) — o mesmo efeito de arrastar o card manualmente até a última coluna do
 * Kanban, só que sem precisar fazer isso à mão depois de já ter fechado o negócio pelo chat/
 * reserva. Chamada por `bookings.controller.ts`/`offers.controller.ts` logo depois de aprovar/
 * recusar de verdade — sempre dentro de um try/catch lá, aditivo: nunca derruba a aprovação/
 * recusa se isso falhar.
 */
export async function closeLeadForDealOutcome(
  userId: string,
  listing: { id: string; organizationId: string | null },
  customerId: string,
  outcome: 'WON' | 'LOST'
): Promise<void> {
  await transitionLeadStatus(
    userId,
    listing,
    [customerId],
    outcome,
    `automático: reserva/proposta ${outcome === 'WON' ? 'aprovada' : 'recusada'}`
  );
}

/**
 * Move o Lead pra `NEGOTIATION` — usada pelo comando de chat `/negociar` (`socket.ts`). Ao
 * contrário de `closeLeadForDealOutcome`, não sabe de antemão qual participante é o cliente
 * (o comando roda em cima de uma Conversation qualquer, sem reserva/proposta associada), então
 * recebe todos os participantes e deixa `transitionLeadStatus` achar o Lead entre eles.
 */
export async function moveLeadToNegotiationFromChatCommand(
  userId: string,
  listing: { id: string; organizationId: string | null },
  participantIds: string[]
): Promise<LeadTransitionResult> {
  return transitionLeadStatus(userId, listing, participantIds, 'NEGOTIATION', 'via comando de chat "/negociar"');
}

/**
 * Registra um contato com o cliente. Se a atribuição aberta do lead ainda não tem
 * `firstContactAt` (base de SLA, Fase 4), preenche com agora — só na 1ª interação.
 */
export async function recordInteraction({
  leadId,
  memberId,
  type,
  content,
}: {
  leadId: string;
  memberId: string;
  type: string;
  content?: string | undefined;
}) {
  const interaction = await prisma.leadInteraction.create({
    data: { leadId, memberId, type, content: content ?? null },
  });

  const current = await getCurrentAssignment(leadId);
  if (current && !current.firstContactAt) {
    await prisma.leadAssignment.update({ where: { id: current.id }, data: { firstContactAt: new Date() } });
  }

  return interaction;
}

// ─── SLA (Fase 4) — indicador visual sob demanda, sem job/notificação proativa ───────────────
// Puramente calculado na resposta da API a partir de assignedAt/firstContactAt (já existentes
// desde as Fases 2/3) — nunca persistido, sem migração nova.

export const SLA_AT_RISK_HOURS = 3;
export const SLA_OVERDUE_HOURS = 4;

export type SlaStatus = 'UNASSIGNED' | 'ON_TIME' | 'AT_RISK' | 'OVERDUE';

export function computeSlaStatus(
  assignment: { assignedAt: Date; firstContactAt: Date | null } | null | undefined
): SlaStatus {
  if (!assignment) return 'UNASSIGNED';
  if (assignment.firstContactAt) return 'ON_TIME'; // já teve 1º contato — SLA de "aguardando" não se aplica mais

  const hoursElapsed = (Date.now() - assignment.assignedAt.getTime()) / 3_600_000;
  if (hoursElapsed >= SLA_OVERDUE_HOURS) return 'OVERDUE';
  if (hoursElapsed >= SLA_AT_RISK_HOURS) return 'AT_RISK';
  return 'ON_TIME';
}
