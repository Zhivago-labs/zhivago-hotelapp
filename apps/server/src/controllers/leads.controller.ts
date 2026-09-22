import type { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { getMembership } from '../lib/organizations.js';
import {
  transferLead,
  getCurrentAssignment,
  resolveLeadAccess,
  canViewLeadAccess,
  recordInteraction,
  computeSlaStatus,
} from '../lib/leads.js';

const LEAD_STATUSES = [
  'NEW',
  'CONTACTED',
  'QUALIFIED',
  'VISIT_SCHEDULED',
  'PROPOSAL',
  'NEGOTIATION',
  'WON',
  'LOST',
] as const;

// STATUS_CHANGE fica de fora — reservado ao auto-log do sistema, nunca escolhível manualmente.
const INTERACTION_TYPES = ['PHONE_CALL', 'WHATSAPP', 'EMAIL', 'NOTE', 'VISIT'] as const;

const VISIT_STATUSES = ['SCHEDULED', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'] as const;

const LEAD_INCLUDE = {
  user: { select: { id: true, name: true, email: true, avatar: true } },
  listing: {
    select: {
      id: true,
      name: true,
      images: { take: 1, orderBy: { order: 'asc' }, select: { url: true } },
    },
  },
  assignments: {
    where: { unassignedAt: null },
    include: { broker: { include: { user: { select: { id: true, name: true, email: true, avatar: true } } } } },
  },
  // "Próxima ação" (seção 112/117 da spec) — só a tarefa incompleta mais próxima do prazo, pra
  // não sobrecarregar o card do Kanban com a lista inteira.
  tasks: {
    where: { completedAt: null },
    orderBy: [{ dueAt: 'asc' }, { createdAt: 'asc' }],
    take: 1,
  },
} satisfies Prisma.LeadInclude;

// SLA (Fase 4) é só cálculo — nunca persistido, sempre derivado da atribuição aberta na resposta.
function withSlaStatus<T extends { assignments: { assignedAt: Date; firstContactAt: Date | null }[] }>(
  lead: T
): T & { slaStatus: ReturnType<typeof computeSlaStatus> } {
  return { ...lead, slaStatus: computeSlaStatus(lead.assignments[0]) };
}

const LEADS_DEFAULT_LIMIT = 200; // Kanban quer ver o funil inteiro de uma vez, não paginado por coluna.
const LEADS_MAX_LIMIT = 500;

// ─── LEADS DA ORGANIZAÇÃO (requer OWNER/ADMIN/MANAGER) ───────────────────────────────────────

/**
 * Filtros e paginação server-side (seção 118/119 da spec) — antes trazia a organização inteira e
 * o front filtrava em memória. `buildingId` filtra pelo empreendimento do imóvel do Lead;
 * `brokerId` pela atribuição atualmente aberta; `search` pelo nome do cliente; `from`/`to` por
 * período de criação do Lead.
 */
export async function getOrganizationLeads(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const membership = (request as FastifyRequest & { orgMembership: { organizationId: string } }).orgMembership;
  const { status, brokerId, buildingId, search, from, to, page: pageParam, limit: limitParam } = request.query as {
    status?: string;
    brokerId?: string;
    buildingId?: string;
    search?: string;
    from?: string;
    to?: string;
    page?: string;
    limit?: string;
  };

  const page = Math.max(1, Number(pageParam) || 1);
  const limit = Math.min(LEADS_MAX_LIMIT, Math.max(1, Number(limitParam) || LEADS_DEFAULT_LIMIT));

  const where = {
    organizationId: membership.organizationId,
    ...(status ? { status } : {}),
    ...(brokerId ? { assignments: { some: { brokerId, unassignedAt: null } } } : {}),
    ...(buildingId ? { listing: { buildingId } } : {}),
    ...(search ? { user: { name: { contains: search, mode: 'insensitive' as const } } } : {}),
    ...(from || to
      ? { createdAt: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.lead.findMany({
      where,
      include: LEAD_INCLUDE,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.lead.count({ where }),
  ]);

  return reply.send({ items: items.map(withSlaStatus), total, page, limit });
}

// ─── MEUS LEADS (requer pertencer a uma organização, qualquer papel) ─────────────────────────

export async function getMyLeads(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id: userId } = request.user as { id: string };

  const membership = await getMembership(userId);
  if (!membership || membership.status !== 'ACTIVE') {
    return reply.status(404).send({ error: 'Você não pertence a nenhuma organização.' });
  }

  const leads = await prisma.lead.findMany({
    where: { assignments: { some: { brokerId: membership.id, unassignedAt: null } } },
    include: LEAD_INCLUDE,
    orderBy: { createdAt: 'desc' },
  });

  return reply.send(leads.map(withSlaStatus));
}

// ─── ATRIBUIR LEAD (requer OWNER/ADMIN/MANAGER) ──────────────────────────────────────────────

export async function assignLeadHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const membership = (request as FastifyRequest & { orgMembership: { id: string; organizationId: string } })
    .orgMembership;
  const { id: leadId } = request.params as { id: string };

  const schema = z.object({
    brokerMemberId: z.string().min(1),
    reason: z.string().trim().optional(),
  });
  const parsed = schema.safeParse(request.body);
  if (!parsed.success) return reply.status(400).send({ error: parsed.error.errors });

  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead || lead.organizationId !== membership.organizationId) {
    return reply.status(404).send({ error: 'Lead não encontrado.' });
  }

  const result = await transferLead({
    leadId: lead.id,
    toMemberId: parsed.data.brokerMemberId,
    changedByMemberId: membership.id,
    reason: parsed.data.reason,
  });

  if (!result.ok) {
    const messages: Record<typeof result.reason, string> = {
      LEAD_NOT_FOUND: 'Lead não encontrado.',
      MEMBER_NOT_IN_ORG: 'Escolha um membro da sua organização.',
      MEMBER_INACTIVE: 'Esse membro está inativo.',
      MEMBER_INELIGIBLE_ROLE: 'Escolha um corretor, gerente ou proprietário.',
      MEMBER_NOT_RECEIVING_LEADS: 'Esse membro optou por não receber leads no momento.',
    };
    const status = result.reason === 'LEAD_NOT_FOUND' ? 404 : 400;
    return reply.status(status).send({ error: messages[result.reason] });
  }

  return reply.status(201).send(result.assignment);
}

// ─── ATUALIZAR STATUS DO LEAD (OWNER/ADMIN/MANAGER: qualquer um; BROKER: só o seu) ───────────

export async function updateLeadStatusHandler(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const { id: userId } = request.user as { id: string };
  const { id: leadId } = request.params as { id: string };

  const schema = z.object({ status: z.enum(LEAD_STATUSES) });
  const parsed = schema.safeParse(request.body);
  if (!parsed.success) return reply.status(400).send({ error: parsed.error.errors });

  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) return reply.status(404).send({ error: 'Lead não encontrado.' });

  const membership = await resolveLeadAccess(userId, lead);
  if (!membership) return reply.status(403).send({ error: 'Sem permissão para esta ação.' });

  const updated = await prisma.lead.update({ where: { id: leadId }, data: { status: parsed.data.status } });

  // Dá uso real ao valor STATUS_CHANGE do enum — auto-log, nunca escolhível manualmente.
  if (parsed.data.status !== lead.status) {
    await recordInteraction({
      leadId,
      memberId: membership.id,
      type: 'STATUS_CHANGE',
      content: `${lead.status} → ${parsed.data.status}`,
    });
  }

  return reply.send(updated);
}

// ─── DETALHE DO LEAD (OWNER/ADMIN/MANAGER: qualquer um da org; BROKER: só o seu) ─────────────

export async function getLeadDetail(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id: userId } = request.user as { id: string };
  const { id: leadId } = request.params as { id: string };

  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: {
      user: { select: { id: true, name: true, email: true, avatar: true } },
      listing: {
        select: { id: true, name: true, images: { take: 1, orderBy: { order: 'asc' }, select: { url: true } } },
      },
    },
  });
  if (!lead) return reply.status(404).send({ error: 'Lead não encontrado.' });

  const membership = await canViewLeadAccess(userId, lead);
  if (!membership) return reply.status(403).send({ error: 'Sem permissão para ver este lead.' });

  const [assignmentHistory, interactions, visits, tasks] = await Promise.all([
    prisma.leadAssignment.findMany({
      where: { leadId },
      include: { broker: { include: { user: { select: { id: true, name: true, email: true, avatar: true } } } } },
      orderBy: { assignedAt: 'asc' },
    }),
    prisma.leadInteraction.findMany({
      where: { leadId },
      include: { member: { include: { user: { select: { id: true, name: true, avatar: true } } } } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.visit.findMany({
      where: { leadId },
      include: { broker: { include: { user: { select: { id: true, name: true, avatar: true } } } } },
      orderBy: { scheduledAt: 'asc' },
    }),
    prisma.leadTask.findMany({
      where: { leadId },
      include: { member: { include: { user: { select: { id: true, name: true, avatar: true } } } } },
      orderBy: [{ completedAt: 'asc' }, { dueAt: 'asc' }, { createdAt: 'asc' }],
    }),
  ]);

  const currentAssignment = assignmentHistory.find((a) => a.unassignedAt === null) ?? null;
  const slaStatus = computeSlaStatus(currentAssignment);

  return reply.send({ ...lead, assignmentHistory, interactions, visits, tasks, slaStatus });
}

// ─── TAREFAS / PRÓXIMA AÇÃO (seção 112/117 da spec) — mesma regra de acesso de sempre ────────
// (OWNER/ADMIN/MANAGER: qualquer lead da org; BROKER: só o seu, via `resolveLeadAccess`).

export async function addTaskHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id: userId } = request.user as { id: string };
  const { id: leadId } = request.params as { id: string };

  const schema = z.object({ title: z.string().trim().min(1), dueAt: z.coerce.date().optional() });
  const parsed = schema.safeParse(request.body);
  if (!parsed.success) return reply.status(400).send({ error: parsed.error.errors });

  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) return reply.status(404).send({ error: 'Lead não encontrado.' });

  const membership = await resolveLeadAccess(userId, lead);
  if (!membership) return reply.status(403).send({ error: 'Sem permissão para esta ação.' });

  const task = await prisma.leadTask.create({
    data: { leadId, memberId: membership.id, title: parsed.data.title, dueAt: parsed.data.dueAt ?? null },
  });

  return reply.status(201).send(task);
}

export async function updateTaskHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id: userId } = request.user as { id: string };
  const { id: taskId } = request.params as { id: string };

  const schema = z.object({ completed: z.boolean().optional(), title: z.string().trim().min(1).optional(), dueAt: z.coerce.date().nullable().optional() });
  const parsed = schema.safeParse(request.body);
  if (!parsed.success) return reply.status(400).send({ error: parsed.error.errors });

  const task = await prisma.leadTask.findUnique({ where: { id: taskId }, include: { lead: true } });
  if (!task) return reply.status(404).send({ error: 'Tarefa não encontrada.' });

  const membership = await resolveLeadAccess(userId, task.lead);
  if (!membership) return reply.status(403).send({ error: 'Sem permissão para esta ação.' });

  const updated = await prisma.leadTask.update({
    where: { id: taskId },
    data: {
      ...(parsed.data.title !== undefined ? { title: parsed.data.title } : {}),
      ...(parsed.data.dueAt !== undefined ? { dueAt: parsed.data.dueAt } : {}),
      ...(parsed.data.completed !== undefined ? { completedAt: parsed.data.completed ? new Date() : null } : {}),
    },
  });

  return reply.send(updated);
}

// ─── REGISTRAR INTERAÇÃO (OWNER/ADMIN/MANAGER: qualquer lead; BROKER: só o seu) ──────────────

export async function addInteractionHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id: userId } = request.user as { id: string };
  const { id: leadId } = request.params as { id: string };

  const schema = z.object({ type: z.enum(INTERACTION_TYPES), content: z.string().trim().optional() });
  const parsed = schema.safeParse(request.body);
  if (!parsed.success) return reply.status(400).send({ error: parsed.error.errors });

  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) return reply.status(404).send({ error: 'Lead não encontrado.' });

  const membership = await resolveLeadAccess(userId, lead);
  if (!membership) return reply.status(403).send({ error: 'Sem permissão para esta ação.' });

  const interaction = await recordInteraction({
    leadId,
    memberId: membership.id,
    type: parsed.data.type,
    content: parsed.data.content,
  });

  return reply.status(201).send(interaction);
}

// ─── AGENDAR VISITA (OWNER/ADMIN/MANAGER: qualquer lead; BROKER: só o seu) ───────────────────

export async function scheduleVisitHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id: userId } = request.user as { id: string };
  const { id: leadId } = request.params as { id: string };

  const schema = z.object({ scheduledAt: z.coerce.date(), notes: z.string().trim().optional() });
  const parsed = schema.safeParse(request.body);
  if (!parsed.success) return reply.status(400).send({ error: parsed.error.errors });

  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) return reply.status(404).send({ error: 'Lead não encontrado.' });

  const membership = await resolveLeadAccess(userId, lead);
  if (!membership) return reply.status(403).send({ error: 'Sem permissão para esta ação.' });

  const currentAssignment = await getCurrentAssignment(leadId);
  if (!currentAssignment) {
    return reply.status(400).send({ error: 'Atribua um corretor a este lead antes de agendar uma visita.' });
  }

  const visit = await prisma.visit.create({
    data: {
      leadId,
      brokerId: currentAssignment.brokerId,
      scheduledAt: parsed.data.scheduledAt,
      notes: parsed.data.notes ?? null,
    },
  });

  return reply.status(201).send(visit);
}

// ─── ATUALIZAR STATUS DA VISITA (OWNER/ADMIN/MANAGER: qualquer uma; BROKER: só a sua) ────────

export async function updateVisitStatusHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id: userId } = request.user as { id: string };
  const { id: visitId } = request.params as { id: string };

  const schema = z.object({ status: z.enum(VISIT_STATUSES) });
  const parsed = schema.safeParse(request.body);
  if (!parsed.success) return reply.status(400).send({ error: parsed.error.errors });

  const visit = await prisma.visit.findUnique({ where: { id: visitId }, include: { lead: true } });
  if (!visit) return reply.status(404).send({ error: 'Visita não encontrada.' });

  const membership = await resolveLeadAccess(userId, visit.lead);
  if (!membership) return reply.status(403).send({ error: 'Sem permissão para esta ação.' });

  const updated = await prisma.visit.update({ where: { id: visitId }, data: { status: parsed.data.status } });
  return reply.send(updated);
}
