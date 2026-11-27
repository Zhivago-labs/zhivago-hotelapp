import type { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { getMembership } from '../lib/organizations.js';
import { workspaceMembership, workspaceLeadScope, WORKSPACE_READ_ALL } from '../lib/workspace.js';
import { buildLeadWhere, leadFilterSchema } from '../lib/crm-query.js';
import {
  transferLead,
  getCurrentAssignment,
  resolveLeadAccess,
  canViewLeadAccess,
  recordInteraction,
  computeSlaStatus,
  transitionLead,
  ensureLeadDetailed,
  getTransferImpact,
  listLeadAssignees,
  leadEligibilityProblem,
  ELIGIBILITY_MESSAGES,
  ASSIGNMENT_SOURCE_LABELS,
  LEAD_STATUSES,
  LOST_REASONS,
  TEAM_ENTRY_SOURCES,
  type EligibilityProblem,
  type TransitionProblem,
} from '../lib/leads.js';

// STATUS_CHANGE/REOPEN/ASSIGNMENT ficam de fora — reservados ao sistema, nunca escolhíveis manualmente.
const INTERACTION_TYPES = ['PHONE_CALL', 'WHATSAPP', 'EMAIL', 'NOTE', 'VISIT'] as const;
const VISIT_STATUSES = ['SCHEDULED', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'] as const;
const OPEN_STATUSES = LEAD_STATUSES.filter((s) => s !== 'WON' && s !== 'LOST') as [string, ...string[]];

const LEAD_INCLUDE = {
  user: { select: { id: true, name: true, email: true, avatar: true } },
  listing: {
    select: {
      id: true,
      name: true,
      operationType: true,
      images: { take: 1, orderBy: { order: 'asc' }, select: { url: true } },
    },
  },
  assignments: {
    where: { unassignedAt: null },
    include: { broker: { include: { user: { select: { id: true, name: true, email: true, avatar: true } } } } },
  },
  tasks: {
    where: { completedAt: null },
    orderBy: [{ dueAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
    take: 1,
  },
} satisfies Prisma.LeadInclude;

function withSlaStatus<T extends { status: string; assignments: { assignedAt: Date; firstContactAt: Date | null }[] }>(lead: T) {
  return { ...lead, slaStatus: computeSlaStatus(lead.assignments[0], lead.status) };
}

const LEADS_DEFAULT_LIMIT = 200;
const LEADS_MAX_LIMIT = 500;

const TRANSITION_MESSAGES: Record<TransitionProblem, { status: number; error: string }> = {
  NO_LEAD: { status: 404, error: 'Lead não encontrado.' },
  ALREADY_THERE: { status: 200, error: '' },
  CONFLICT: { status: 409, error: 'Esta oportunidade mudou de etapa enquanto você editava. Atualize a página e tente de novo.' },
  REOPEN_REQUIRED: { status: 400, error: 'Oportunidade encerrada: use "Reabrir oportunidade" para retomá-la.' },
  NOT_CLOSED: { status: 400, error: 'Só é possível reabrir uma oportunidade ganha ou perdida.' },
  LOST_REASON_REQUIRED: { status: 400, error: 'Informe o motivo da perda.' },
  NOT_FORWARD: { status: 400, error: 'Transição não permitida.' },
};

function transferError(reason: EligibilityProblem | 'LEAD_NOT_FOUND' | 'REASON_REQUIRED') {
  if (reason === 'LEAD_NOT_FOUND') return { status: 404, error: 'Lead não encontrado.' };
  if (reason === 'REASON_REQUIRED') return { status: 400, error: 'Informe o motivo da transferência.' };
  return { status: 400, error: ELIGIBILITY_MESSAGES[reason] };
}

// ─── CARTEIRA / KANBAN (escopo por papel) ────────────────────────────────────────────────────

/**
 * Filtros e paginação server-side com o mesmo construtor de filtros de Contatos. Totais por etapa
 * consideram todos os resultados do filtro (o front mostra "exibindo X de Y nesta etapa").
 */
export async function getOrganizationLeads(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const membership = await workspaceMembership(request);
  if (!membership) return reply.status(403).send({ error: 'Vínculo ativo necessário.' });
  const parsed = leadFilterSchema
    .extend({
      page: z.coerce.number().int().positive().default(1),
      limit: z.coerce.number().int().positive().max(LEADS_MAX_LIMIT).default(LEADS_DEFAULT_LIMIT),
    })
    .safeParse(request.query);
  if (!parsed.success) return reply.status(400).send({ error: 'Filtros inválidos.' });
  const { page, limit, ...filters } = parsed.data;
  const scope = workspaceLeadScope(membership);
  const where = await buildLeadWhere(membership, filters);
  const [items, rows, allTotal] = await prisma.$transaction(
    [
      prisma.lead.findMany({ where, include: LEAD_INCLUDE, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], skip: (page - 1) * limit, take: limit }),
      prisma.lead.findMany({ where, select: { status: true, assignments: { where: { unassignedAt: null }, select: { assignedAt: true, firstContactAt: true } } } }),
      prisma.lead.count({ where: scope }),
    ],
    { isolationLevel: 'RepeatableRead' }
  );
  const active = rows.filter((row) => row.status !== 'WON' && row.status !== 'LOST');
  const byStatus: Record<string, number> = Object.fromEntries(LEAD_STATUSES.map((status) => [status, 0]));
  for (const row of rows) byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;
  const pageByStatus: Record<string, number> = Object.fromEntries(LEAD_STATUSES.map((status) => [status, 0]));
  for (const item of items) pageByStatus[item.status] = (pageByStatus[item.status] ?? 0) + 1;
  return reply.send({
    items: items.map(withSlaStatus),
    total: rows.length,
    allTotal,
    page,
    limit,
    summary: {
      active: active.length,
      unassigned: active.filter((row) => !row.assignments.length).length,
      overdue: active.filter((row) => computeSlaStatus(row.assignments[0], row.status) === 'OVERDUE').length,
      byStatus,
      pageByStatus,
    },
  });
}

export async function getMyLeads(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id: userId } = request.user as { id: string };
  const membership = await getMembership(userId);
  if (!membership || membership.status !== 'ACTIVE') {
    return reply.status(404).send({ error: 'Você não pertence a nenhuma organização.' });
  }
  const leads = await prisma.lead.findMany({
    where: { organizationId: membership.organizationId, assignments: { some: { brokerId: membership.id, unassignedAt: null } } },
    include: LEAD_INCLUDE,
    orderBy: { createdAt: 'desc' },
  });
  return reply.send(leads.map(withSlaStatus));
}

// ─── FILA "SEM RESPONSÁVEL" (gestão + leitura do assistente) ─────────────────────────────────

const QUEUE_REASON_LABELS: Record<string, string> = {
  NO_ELIGIBLE: 'Ninguém elegível no rodízio',
  MANUAL_MODE: 'Sem responsável direto (fila manual)',
  MEMBER_REMOVED: 'Responsável saiu da equipe',
  REOPENED: 'Reaberta sem responsável disponível',
  LEGACY: 'Registro anterior sem responsável',
};

export async function getUnassignedQueue(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const membership = await workspaceMembership(request);
  if (!membership || !WORKSPACE_READ_ALL.includes(membership.role)) {
    return reply.status(403).send({ error: 'Sem permissão para ver a fila.' });
  }
  const parsed = leadFilterSchema
    .pick({ source: true, buildingId: true, operationType: true, search: true })
    .extend({ page: z.coerce.number().int().positive().default(1) })
    .safeParse(request.query);
  if (!parsed.success) return reply.status(400).send({ error: 'Filtros inválidos.' });
  const { page, ...filters } = parsed.data;
  const where = await buildLeadWhere(membership, { ...filters, stage: 'ACTIVE', unassigned: 'true' });
  const [total, items] = await prisma.$transaction([
    prisma.lead.count({ where }),
    prisma.lead.findMany({
      where,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      skip: (page - 1) * 50,
      take: 50,
      select: {
        id: true, status: true, source: true, createdAt: true, queuedAt: true, queueReason: true, lastActivityAt: true,
        user: { select: { id: true, name: true, email: true, phone: true } },
        listing: { select: { id: true, name: true, operationType: true, building: { select: { id: true, name: true } } } },
      },
    }),
  ]);
  const now = Date.now();
  return reply.send({
    total,
    page,
    limit: 50,
    items: items.map((item) => ({
      ...item,
      ageHours: (now - item.createdAt.getTime()) / 3_600_000,
      queueReasonLabel: item.queueReason ? QUEUE_REASON_LABELS[item.queueReason] ?? item.queueReason : 'Sem responsável',
    })),
  });
}

// ─── RESPONSÁVEIS ELEGÍVEIS (definição única, usada pela ficha e por Equipe) ─────────────────

export async function getLeadAssignees(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const membership = await workspaceMembership(request);
  if (!membership) return reply.status(403).send({ error: 'Vínculo ativo necessário.' });
  return reply.send(await listLeadAssignees(membership.organizationId));
}

// ─── ATRIBUIR / TRANSFERIR / ASSUMIR ─────────────────────────────────────────────────────────

export async function assignLeadHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const membership = (request as FastifyRequest & { orgMembership: { id: string; organizationId: string } }).orgMembership;
  const { id: leadId } = request.params as { id: string };
  const parsed = z
    .object({
      brokerMemberId: z.string().min(1),
      reason: z.string().trim().max(500).optional(),
      moveOpenWork: z.boolean().optional(),
    })
    .safeParse(request.body);
  if (!parsed.success) return reply.status(400).send({ error: parsed.error.errors });

  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead || lead.organizationId !== membership.organizationId) return reply.status(404).send({ error: 'Lead não encontrado.' });

  const result = await transferLead({
    leadId: lead.id,
    toMemberId: parsed.data.brokerMemberId,
    changedByMemberId: membership.id,
    reason: parsed.data.reason,
    moveOpenWork: parsed.data.moveOpenWork ?? false,
  });
  if (!result.ok) {
    const { status, error } = transferError(result.reason);
    return reply.status(status).send({ error, code: result.reason });
  }
  return reply.status(result.changed ? 201 : 200).send({ ...result.assignment, changed: result.changed });
}

export async function getTransferPreview(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const membership = (request as FastifyRequest & { orgMembership: { organizationId: string } }).orgMembership;
  const { id: leadId } = request.params as { id: string };
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead || lead.organizationId !== membership.organizationId) return reply.status(404).send({ error: 'Lead não encontrado.' });
  return reply.send(await getTransferImpact(leadId));
}

/** Gestão assume uma oportunidade da fila para si (precisa ser elegível para receber leads). */
export async function claimLeadHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const membership = (request as FastifyRequest & { orgMembership: { id: string; organizationId: string } }).orgMembership;
  const { id: leadId } = request.params as { id: string };
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead || lead.organizationId !== membership.organizationId) return reply.status(404).send({ error: 'Lead não encontrado.' });
  if (await getCurrentAssignment(leadId)) return reply.status(409).send({ error: 'Esta oportunidade já tem responsável.' });
  const result = await transferLead({ leadId, toMemberId: membership.id, changedByMemberId: membership.id, source: 'SELF_ASSIGNED' });
  if (!result.ok) {
    const { status, error } = transferError(result.reason);
    return reply.status(status).send({ error, code: result.reason });
  }
  return reply.status(201).send(result.assignment);
}

/** Atribuição em lote, limitada à própria organização e a 50 oportunidades por vez. */
export async function bulkAssignHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const membership = (request as FastifyRequest & { orgMembership: { id: string; organizationId: string } }).orgMembership;
  const parsed = z
    .object({ leadIds: z.array(z.string().min(1)).min(1).max(50), brokerMemberId: z.string().min(1), reason: z.string().trim().max(500).optional() })
    .safeParse(request.body);
  if (!parsed.success) return reply.status(400).send({ error: 'Selecione de 1 a 50 oportunidades e um responsável.' });

  const target = await prisma.organizationMember.findUnique({ where: { id: parsed.data.brokerMemberId } });
  const problem = leadEligibilityProblem(target, membership.organizationId);
  if (problem) return reply.status(400).send({ error: ELIGIBILITY_MESSAGES[problem], code: problem });

  const leads = await prisma.lead.findMany({ where: { id: { in: parsed.data.leadIds }, organizationId: membership.organizationId }, select: { id: true } });
  const results: { leadId: string; ok: boolean; error?: string }[] = [];
  for (const { id } of leads) {
    const result = await transferLead({ leadId: id, toMemberId: target!.id, changedByMemberId: membership.id, reason: parsed.data.reason });
    results.push(result.ok ? { leadId: id, ok: true } : { leadId: id, ok: false, error: transferError(result.reason).error });
  }
  const notFound = parsed.data.leadIds.filter((id) => !leads.some((lead) => lead.id === id));
  for (const id of notFound) results.push({ leadId: id, ok: false, error: 'Lead não encontrado.' });
  return reply.send({ assigned: results.filter((r) => r.ok).length, results });
}

// ─── ETAPA, ENCERRAMENTO E REABERTURA ────────────────────────────────────────────────────────

export async function updateLeadStatusHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id: userId } = request.user as { id: string };
  const { id: leadId } = request.params as { id: string };
  const parsed = z
    .object({
      status: z.enum(LEAD_STATUSES),
      expectedStatus: z.enum(LEAD_STATUSES).optional(),
      lostReason: z.enum(Object.keys(LOST_REASONS) as [string, ...string[]]).optional(),
      lostNote: z.string().trim().max(1000).optional(),
    })
    .safeParse(request.body);
  if (!parsed.success) return reply.status(400).send({ error: parsed.error.errors });

  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) return reply.status(404).send({ error: 'Lead não encontrado.' });
  const membership = await resolveLeadAccess(userId, lead);
  if (!membership) return reply.status(403).send({ error: 'Sem permissão para esta ação.' });

  const result = await transitionLead({
    leadId,
    to: parsed.data.status,
    actorMemberId: membership.id,
    expectedStatus: parsed.data.expectedStatus,
    lostReason: parsed.data.lostReason,
    lostNote: parsed.data.lostNote,
  });
  if (!result.ok) {
    if (result.reason === 'ALREADY_THERE') return reply.send(lead);
    const { status, error } = TRANSITION_MESSAGES[result.reason];
    return reply.status(status).send({ error, code: result.reason });
  }
  return reply.send(result.lead);
}

export async function reopenLeadHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id: userId } = request.user as { id: string };
  const { id: leadId } = request.params as { id: string };
  const parsed = z
    .object({ status: z.enum(OPEN_STATUSES).default('CONTACTED'), note: z.string().trim().max(500).optional() })
    .safeParse(request.body ?? {});
  if (!parsed.success) return reply.status(400).send({ error: parsed.error.errors });

  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) return reply.status(404).send({ error: 'Lead não encontrado.' });
  const membership = await resolveLeadAccess(userId, lead);
  if (!membership) return reply.status(403).send({ error: 'Sem permissão para esta ação.' });

  const result = await transitionLead({ leadId, to: parsed.data.status, actorMemberId: membership.id, reopen: true, note: parsed.data.note });
  if (!result.ok) {
    const { status, error } = TRANSITION_MESSAGES[result.reason];
    return reply.status(status === 200 ? 400 : status).send({ error: error || 'Nada a reabrir.', code: result.reason });
  }
  return reply.send(result.lead);
}

// ─── FICHA DA OPORTUNIDADE ───────────────────────────────────────────────────────────────────

type TimelineEvent = {
  id: string;
  kind: 'ENTRY' | 'ASSIGNMENT' | 'UNASSIGNMENT' | 'INTERACTION' | 'STATUS' | 'VISIT' | 'TASK' | 'TASK_DONE';
  at: Date;
  actor: string | null;
  title: string;
  detail: string | null;
};

const ENTRY_KIND_LABELS: Record<string, string> = { ENTRY: 'Entrada', REENTRY: 'Reentrada', INTENT: 'Clique em canal externo' };
const SOURCE_LABELS: Record<string, string> = {
  CHAT: 'Chat', BOOKING: 'Reserva', OFFER: 'Proposta', WHATSAPP: 'WhatsApp', PHONE: 'Telefone',
  WALK_IN: 'Visita ao plantão', REFERRAL: 'Indicação', FORM: 'Formulário', OTHER: 'Outro',
};
const INTERACTION_LABELS: Record<string, string> = {
  PHONE_CALL: 'Ligação', WHATSAPP: 'WhatsApp', EMAIL: 'E-mail', NOTE: 'Nota interna', VISIT: 'Visita', STATUS_CHANGE: 'Mudança de etapa', REOPEN: 'Oportunidade reaberta',
};

export async function getLeadDetail(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id: userId } = request.user as { id: string };
  const { id: leadId } = request.params as { id: string };

  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: {
      user: { select: { id: true, name: true, email: true, avatar: true, phone: true } },
      listing: {
        select: {
          id: true, name: true, operationType: true,
          building: { select: { id: true, name: true } },
          images: { take: 1, orderBy: { order: 'asc' }, select: { url: true } },
        },
      },
    },
  });
  if (!lead) return reply.status(404).send({ error: 'Lead não encontrado.' });

  const membership = await canViewLeadAccess(userId, lead);
  if (!membership) return reply.status(403).send({ error: 'Sem permissão para ver este lead.' });

  const memberUser = { include: { user: { select: { id: true, name: true, email: true, avatar: true } } } } as const;
  const [assignmentHistory, interactions, visits, tasks, entries, conversations, bookings, negotiations, closedBy] = await Promise.all([
    prisma.leadAssignment.findMany({ where: { leadId }, include: { broker: memberUser }, orderBy: { assignedAt: 'asc' } }),
    prisma.leadInteraction.findMany({ where: { leadId }, include: { member: memberUser }, orderBy: { createdAt: 'desc' } }),
    prisma.visit.findMany({ where: { leadId }, include: { broker: memberUser }, orderBy: { scheduledAt: 'asc' } }),
    prisma.leadTask.findMany({
      where: { leadId },
      include: { member: memberUser, assignee: memberUser },
      orderBy: [{ completedAt: { sort: 'asc', nulls: 'first' } }, { dueAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
    }),
    prisma.leadEntry.findMany({ where: { leadId }, orderBy: { createdAt: 'asc' } }),
    prisma.conversation.findMany({
      where: { OR: [{ leadId }, { leadId: null, propertyId: lead.listingId, participants: { some: { id: lead.userId } } }] },
      select: { id: true, isClosed: true, leadId: true, participants: { select: { id: true } } },
    }),
    prisma.booking.findMany({ where: { leadId }, select: { id: true, status: true, startDate: true, endDate: true }, orderBy: { createdAt: 'desc' }, take: 5 }),
    prisma.negotiation.findMany({ where: { leadId }, select: { id: true, status: true, operationType: true, agreedValue: true }, orderBy: { createdAt: 'desc' }, take: 5 }),
    lead.closedById ? prisma.organizationMember.findUnique({ where: { id: lead.closedById }, include: { user: { select: { name: true } } } }) : null,
  ]);

  const currentAssignment = assignmentHistory.find((a) => a.unassignedAt === null) ?? null;
  const memberName = (id: string | null) => {
    if (!id) return null;
    return (
      assignmentHistory.find((a) => a.brokerId === id)?.broker.user.name ??
      interactions.find((i) => i.memberId === id)?.member.user.name ??
      null
    );
  };

  const timeline: TimelineEvent[] = [];
  for (const entry of entries) {
    timeline.push({ id: `entry-${entry.id}`, kind: 'ENTRY', at: entry.createdAt, actor: memberName(entry.createdById), title: `${ENTRY_KIND_LABELS[entry.kind] ?? entry.kind} · ${SOURCE_LABELS[entry.source] ?? entry.source}`, detail: entry.note });
  }
  for (const a of assignmentHistory) {
    timeline.push({ id: `assign-${a.id}`, kind: 'ASSIGNMENT', at: a.assignedAt, actor: memberName(a.assignedBy) ?? (a.assignedBy ? null : 'Distribuição automática'), title: `Responsável: ${a.broker.user.name}`, detail: a.source ? ASSIGNMENT_SOURCE_LABELS[a.source] ?? a.source : null });
    if (a.unassignedAt) timeline.push({ id: `unassign-${a.id}`, kind: 'UNASSIGNMENT', at: a.unassignedAt, actor: null, title: `Saiu da responsabilidade: ${a.broker.user.name}`, detail: a.reason });
  }
  for (const i of interactions) {
    const isStatus = i.type === 'STATUS_CHANGE' || i.type === 'REOPEN';
    const outcome = i.outcome === 'ATTEMPT' ? ' (tentativa sem sucesso)' : '';
    timeline.push({ id: `int-${i.id}`, kind: isStatus ? 'STATUS' : 'INTERACTION', at: i.createdAt, actor: i.member.user.name, title: `${INTERACTION_LABELS[i.type] ?? i.type}${outcome}`, detail: i.content });
  }
  for (const v of visits) {
    timeline.push({ id: `visit-${v.id}`, kind: 'VISIT', at: v.createdAt, actor: v.broker.user.name, title: `Visita agendada para ${v.scheduledAt.toISOString()}`, detail: v.notes });
  }
  for (const t of tasks) {
    timeline.push({ id: `task-${t.id}`, kind: 'TASK', at: t.createdAt, actor: t.member.user.name, title: `Tarefa: ${t.title}`, detail: t.assignee ? `Para ${t.assignee.user.name}` : null });
    if (t.completedAt) timeline.push({ id: `taskdone-${t.id}`, kind: 'TASK_DONE', at: t.completedAt, actor: null, title: `Tarefa concluída: ${t.title}`, detail: null });
  }
  timeline.sort((a, b) => b.at.getTime() - a.at.getTime() || a.id.localeCompare(b.id));

  // A ficha não concede acesso à conversa: só devolve o link se quem vê participa dela.
  const myConversation = conversations.find((c) => c.participants.some((p) => p.id === userId)) ?? null;

  return reply.send({
    ...lead,
    assignmentHistory,
    interactions,
    visits,
    tasks,
    entries,
    timeline,
    bookings,
    negotiations,
    slaStatus: computeSlaStatus(currentAssignment, lead.status),
    routing: currentAssignment
      ? { source: currentAssignment.source, label: currentAssignment.source ? ASSIGNMENT_SOURCE_LABELS[currentAssignment.source] ?? currentAssignment.source : 'Atribuição registrada', assignedAt: currentAssignment.assignedAt }
      : { source: null, label: lead.queueReason ? QUEUE_REASON_LABELS[lead.queueReason] ?? 'Sem responsável' : 'Sem responsável', assignedAt: null },
    lostReasonLabel: lead.lostReason ? LOST_REASONS[lead.lostReason as keyof typeof LOST_REASONS] ?? lead.lostReason : null,
    closedByName: closedBy?.user.name ?? null,
    conversation: myConversation ? { id: myConversation.id, isClosed: myConversation.isClosed } : null,
    hasConversation: conversations.length > 0,
    viewer: { memberId: membership.id, role: membership.role },
  });
}

// ─── REGISTRO PELA EQUIPE / INTENÇÃO POR CANAL EXTERNO ───────────────────────────────────────

/**
 * Equipe registra uma entrada vinda de telefone, WhatsApp, plantão, indicação ou formulário para
 * um cliente que já tem conta (e-mail exato ou telefone com qualquer pontuação). Nova oportunidade
 * passa pela mesma distribuição; corretor que registra fica com ela. Repetida = nova entrada.
 */
export async function registerLeadHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const membership = await workspaceMembership(request);
  if (!membership || membership.role === 'ASSISTANT') return reply.status(403).send({ error: 'Sem permissão para registrar contatos.' });
  const parsed = z
    .object({
      listingId: z.string().min(1),
      email: z.string().trim().email().optional(),
      phone: z.string().trim().max(30).optional(),
      source: z.enum(TEAM_ENTRY_SOURCES),
      note: z.string().trim().max(1000).optional(),
      contacted: z.boolean().optional(),
      assignToMe: z.boolean().optional(),
    })
    .refine((v) => v.email || v.phone, { message: 'Informe o e-mail ou o telefone do cliente.' })
    .safeParse(request.body);
  if (!parsed.success) return reply.status(400).send({ error: parsed.error.errors[0]?.message ?? 'Dados inválidos.' });
  const data = parsed.data;

  const listing = await prisma.listing.findUnique({ where: { id: data.listingId }, select: { id: true, organizationId: true } });
  if (!listing || listing.organizationId !== membership.organizationId) return reply.status(404).send({ error: 'Imóvel não encontrado na sua imobiliária.' });

  let customer = data.email ? await prisma.user.findFirst({ where: { email: { equals: data.email, mode: 'insensitive' } }, select: { id: true, name: true } }) : null;
  if (!customer && data.phone) {
    const digits = data.phone.replace(/\D/g, '');
    if (digits.length >= 8) {
      const rows = await prisma.$queryRaw<{ id: string; name: string }[]>`
        SELECT "id", "name" FROM "User" WHERE "phone" IS NOT NULL AND regexp_replace("phone", '\\D', '', 'g') = ${digits} LIMIT 2
      `;
      if (rows.length === 1) customer = rows[0]!;
      else if (rows.length > 1) return reply.status(409).send({ error: 'Mais de uma conta usa esse telefone. Informe o e-mail do cliente.' });
    }
  }
  if (!customer) {
    return reply.status(404).send({ error: 'Nenhuma conta encontrada com esse e-mail ou telefone. Peça ao cliente para se cadastrar no Zhivago.' });
  }

  const memberRecord = await prisma.organizationMember.findUnique({ where: { id: membership.id } });
  if (customer.id === memberRecord?.userId) return reply.status(400).send({ error: 'Você não pode registrar a si mesmo como cliente.' });
  const wantsSelf = membership.role === 'BROKER' ? true : data.assignToMe ?? false;
  const { lead, created } = await ensureLeadDetailed({
    userId: customer.id,
    listingId: listing.id,
    organizationId: membership.organizationId,
    source: data.source,
    note: data.note,
    createdByMemberId: membership.id,
    preferredMemberId: wantsSelf ? membership.id : null,
  });

  if (data.contacted && (data.source === 'PHONE' || data.source === 'WHATSAPP')) {
    const access = await resolveLeadAccess((request.user as { id: string }).id, lead);
    if (access) await recordInteraction({ leadId: lead.id, memberId: access.id, type: data.source === 'PHONE' ? 'PHONE_CALL' : 'WHATSAPP', content: data.note, outcome: 'CONTACT' });
  }
  return reply.status(created ? 201 : 200).send({ leadId: lead.id, created, customer: { id: customer.id, name: customer.name } });
}

/**
 * Cliente logado clicou no WhatsApp de um imóvel da imobiliária: registra a intenção (origem
 * WHATSAPP, tipo INTENT) — não confirma atendimento nem conta como resposta. Imóvel de pessoa
 * física, anunciante e visitante sem login: no-op.
 */
export async function recordChannelIntentHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id: userId } = request.user as { id: string };
  const parsed = z.object({ listingId: z.string().min(1), channel: z.literal('WHATSAPP') }).safeParse(request.body);
  if (!parsed.success) return reply.status(400).send({ error: 'Dados inválidos.' });
  const listing = await prisma.listing.findUnique({ where: { id: parsed.data.listingId }, select: { id: true, organizationId: true, status: true } });
  if (!listing?.organizationId || listing.status !== 'APPROVED') return reply.status(204).send();
  const member = await getMembership(userId);
  if (member?.organizationId === listing.organizationId && member.status === 'ACTIVE') return reply.status(204).send();
  await ensureLeadDetailed({ userId, listingId: listing.id, organizationId: listing.organizationId, source: 'WHATSAPP', kind: 'INTENT' });
  return reply.status(204).send();
}

// ─── TAREFAS / PRÓXIMA AÇÃO ──────────────────────────────────────────────────────────────────

async function validAssignee(assigneeId: string | null | undefined, organizationId: string) {
  if (!assigneeId) return true;
  const member = await prisma.organizationMember.findUnique({ where: { id: assigneeId } });
  return !!member && member.organizationId === organizationId && member.status === 'ACTIVE' && member.role !== 'ASSISTANT';
}

export async function addTaskHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id: userId } = request.user as { id: string };
  const { id: leadId } = request.params as { id: string };
  const parsed = z
    .object({ title: z.string().trim().min(1).max(200), dueAt: z.coerce.date().optional(), assigneeId: z.string().min(1).optional() })
    .safeParse(request.body);
  if (!parsed.success) return reply.status(400).send({ error: parsed.error.errors });

  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) return reply.status(404).send({ error: 'Lead não encontrado.' });
  const membership = await resolveLeadAccess(userId, lead);
  if (!membership) return reply.status(403).send({ error: 'Sem permissão para esta ação.' });
  if (!(await validAssignee(parsed.data.assigneeId, lead.organizationId))) {
    return reply.status(400).send({ error: 'Escolha um integrante ativo da equipe para a tarefa.' });
  }

  const task = await prisma.leadTask.create({
    data: { leadId, memberId: membership.id, title: parsed.data.title, dueAt: parsed.data.dueAt ?? null, assigneeId: parsed.data.assigneeId ?? null },
  });
  await prisma.lead.update({ where: { id: leadId }, data: { lastActivityAt: task.createdAt } });
  return reply.status(201).send(task);
}

export async function updateTaskHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id: userId } = request.user as { id: string };
  const { id: taskId } = request.params as { id: string };
  const parsed = z
    .object({
      completed: z.boolean().optional(),
      title: z.string().trim().min(1).max(200).optional(),
      dueAt: z.coerce.date().nullable().optional(),
      assigneeId: z.string().min(1).nullable().optional(),
    })
    .safeParse(request.body);
  if (!parsed.success) return reply.status(400).send({ error: parsed.error.errors });

  const task = await prisma.leadTask.findUnique({ where: { id: taskId }, include: { lead: true } });
  if (!task) return reply.status(404).send({ error: 'Tarefa não encontrada.' });
  const membership = await resolveLeadAccess(userId, task.lead);
  if (!membership) return reply.status(403).send({ error: 'Sem permissão para esta ação.' });
  if (!(await validAssignee(parsed.data.assigneeId, task.lead.organizationId))) {
    return reply.status(400).send({ error: 'Escolha um integrante ativo da equipe para a tarefa.' });
  }

  const updated = await prisma.leadTask.update({
    where: { id: taskId },
    data: {
      ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
      ...(parsed.data.dueAt !== undefined ? { dueAt: parsed.data.dueAt } : {}),
      ...(parsed.data.assigneeId !== undefined ? { assigneeId: parsed.data.assigneeId } : {}),
      ...(parsed.data.completed !== undefined ? { completedAt: parsed.data.completed ? new Date() : null } : {}),
    },
  });
  await prisma.lead.update({ where: { id: task.leadId }, data: { lastActivityAt: new Date() } });
  return reply.send(updated);
}

// ─── INTERAÇÕES ──────────────────────────────────────────────────────────────────────────────

export async function addInteractionHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id: userId } = request.user as { id: string };
  const { id: leadId } = request.params as { id: string };
  const parsed = z
    .object({ type: z.enum(INTERACTION_TYPES), content: z.string().trim().max(2000).optional(), outcome: z.enum(['CONTACT', 'ATTEMPT']).optional() })
    .safeParse(request.body);
  if (!parsed.success) return reply.status(400).send({ error: parsed.error.errors });

  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) return reply.status(404).send({ error: 'Lead não encontrado.' });
  const membership = await resolveLeadAccess(userId, lead);
  if (!membership) return reply.status(403).send({ error: 'Sem permissão para esta ação.' });

  const interaction = await recordInteraction({ leadId, memberId: membership.id, type: parsed.data.type, content: parsed.data.content, outcome: parsed.data.outcome });
  return reply.status(201).send(interaction);
}

// ─── VISITAS ─────────────────────────────────────────────────────────────────────────────────

export async function scheduleVisitHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id: userId } = request.user as { id: string };
  const { id: leadId } = request.params as { id: string };
  const parsed = z.object({ scheduledAt: z.coerce.date(), notes: z.string().trim().max(1000).optional() }).safeParse(request.body);
  if (!parsed.success) return reply.status(400).send({ error: parsed.error.errors });

  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) return reply.status(404).send({ error: 'Lead não encontrado.' });
  const membership = await resolveLeadAccess(userId, lead);
  if (!membership) return reply.status(403).send({ error: 'Sem permissão para esta ação.' });

  const currentAssignment = await getCurrentAssignment(leadId);
  if (!currentAssignment) return reply.status(400).send({ error: 'Atribua um responsável a este lead antes de agendar uma visita.' });

  const visit = await prisma.visit.create({
    data: { leadId, brokerId: currentAssignment.brokerId, scheduledAt: parsed.data.scheduledAt, notes: parsed.data.notes ?? null },
  });
  await prisma.lead.update({ where: { id: leadId }, data: { lastActivityAt: visit.createdAt } });
  return reply.status(201).send(visit);
}

export async function updateVisitStatusHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id: userId } = request.user as { id: string };
  const { id: visitId } = request.params as { id: string };
  const parsed = z.object({ status: z.enum(VISIT_STATUSES) }).safeParse(request.body);
  if (!parsed.success) return reply.status(400).send({ error: parsed.error.errors });

  const visit = await prisma.visit.findUnique({ where: { id: visitId }, include: { lead: true } });
  if (!visit) return reply.status(404).send({ error: 'Visita não encontrada.' });
  const membership = await resolveLeadAccess(userId, visit.lead);
  if (!membership) return reply.status(403).send({ error: 'Sem permissão para esta ação.' });

  const updated = await prisma.visit.update({ where: { id: visitId }, data: { status: parsed.data.status } });
  // Visita realizada é contato efetivo com o cliente.
  if (parsed.data.status === 'COMPLETED') {
    await prisma.leadAssignment.updateMany({
      where: { leadId: visit.leadId, unassignedAt: null, firstContactAt: null },
      data: { firstContactAt: new Date(), firstContactChannel: 'VISIT' },
    });
  }
  await prisma.lead.update({ where: { id: visit.leadId }, data: { lastActivityAt: new Date() } });
  return reply.send(updated);
}

