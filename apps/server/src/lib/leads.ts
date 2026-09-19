import type { Lead, Organization } from '@prisma/client';
import { prisma } from './prisma.js';
import { getMembership } from './organizations.js';

// Papéis elegíveis para receber leads (distribuição aleatória e atribuição manual) — Corretor e
// Gerente. OWNER/ADMIN/ASSISTANT gerenciam o CRM mas não entram no sorteio.
export const ELIGIBLE_LEAD_ROLES = ['BROKER', 'MANAGER'] as const;

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
}: {
  lead: { id: string; userId: string; listingId: string };
  brokerMemberId: string;
  brokerUserId: string;
  assignedByMemberId: string | null;
  reason?: string | undefined;
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
      data: { leadId: lead.id, brokerId: brokerMemberId, assignedBy: assignedByMemberId },
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
 * Regra de distribuição de um lead novo:
 * 1) Se o imóvel foi cadastrado por um CORRETOR (Listing.agentId aponta pra um membro com role
 *    BROKER), o lead é sempre dele — nunca entra no sorteio, mesmo em modo MANUAL. É "o lead dele".
 * 2) Caso contrário (imóvel de ADMIN/OWNER/MANAGER/pessoa física), segue o modo da organização:
 *    MANUAL não atribui nada (alguém com OWNER/ADMIN/MANAGER atribui depois pelo painel);
 *    ROUND_ROBIN sorteia aleatoriamente entre membros elegíveis (BROKER/MANAGER, ACTIVE, que não
 *    optaram por não receber leads — `receiveLeads`).
 */
export async function distributeLead(lead: Lead, organization: Organization): Promise<void> {
  const listing = await prisma.listing.findUnique({ where: { id: lead.listingId }, select: { agentId: true } });

  if (listing?.agentId) {
    const agentMembership = await prisma.organizationMember.findUnique({ where: { userId: listing.agentId } });
    if (agentMembership && agentMembership.organizationId === organization.id && agentMembership.role === 'BROKER') {
      await assignLead({
        lead,
        brokerMemberId: agentMembership.id,
        brokerUserId: agentMembership.userId,
        assignedByMemberId: null,
      });
      return;
    }
  }

  if (organization.leadDistributionMode !== 'ROUND_ROBIN') return;

  const eligible = await prisma.organizationMember.findMany({
    where: {
      organizationId: organization.id,
      role: { in: ELIGIBLE_LEAD_ROLES as unknown as string[] },
      status: 'ACTIVE',
      receiveLeads: true,
    },
  });
  if (eligible.length === 0) return;

  const chosen = eligible[Math.floor(Math.random() * eligible.length)]!;
  await assignLead({ lead, brokerMemberId: chosen.id, brokerUserId: chosen.userId, assignedByMemberId: null });
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
