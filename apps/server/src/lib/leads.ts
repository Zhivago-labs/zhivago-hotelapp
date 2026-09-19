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
 * completo preservado (decisão fechada em docs/crm-b2b-organizacoes-leads.md).
 */
export async function assignLead({
  leadId,
  brokerMemberId,
  assignedByMemberId,
  reason,
}: {
  leadId: string;
  brokerMemberId: string;
  assignedByMemberId: string | null;
  reason?: string | undefined;
}) {
  const current = await getCurrentAssignment(leadId);
  if (current) {
    await prisma.leadAssignment.update({
      where: { id: current.id },
      data: { unassignedAt: new Date(), reason: reason ?? null },
    });
  }

  return prisma.leadAssignment.create({
    data: {
      leadId,
      brokerId: brokerMemberId,
      assignedBy: assignedByMemberId,
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
      await assignLead({ leadId: lead.id, brokerMemberId: agentMembership.id, assignedByMemberId: null });
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
  await assignLead({ leadId: lead.id, brokerMemberId: chosen.id, assignedByMemberId: null });
}

/**
 * Regra de permissão única, reaproveitada por todo handler que age sobre um Lead (Fase 3):
 * OWNER/ADMIN/MANAGER agem em qualquer lead da própria organização; BROKER só no lead
 * atualmente atribuído a si (via `getCurrentAssignment`). Retorna a membership de quem pode
 * agir, ou `null` se não puder — quem chama decide 403 vs 404 conforme o contexto.
 */
export async function resolveLeadAccess(userId: string, lead: { id: string; organizationId: string }) {
  const membership = await getMembership(userId);
  if (!membership || membership.organizationId !== lead.organizationId) return null;

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
  if (!membership || membership.organizationId !== lead.organizationId) return null;

  const canViewAny = ['OWNER', 'ADMIN', 'MANAGER', 'ASSISTANT'].includes(membership.role);
  if (canViewAny) return membership;

  const current = await getCurrentAssignment(lead.id);
  if (!current || current.brokerId !== membership.id) return null;
  return membership;
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
