import type { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { getMembership } from '../lib/organizations.js';
import {
  assignLead,
  getCurrentAssignment,
  resolveLeadAccess,
  canViewLeadAccess,
  recordInteraction,
  computeSlaStatus,
  ELIGIBLE_LEAD_ROLES,
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
      images: { take: 1, orderBy: { order: 'asc' as const }, select: { url: true } },
    },
  },
  assignments: {
    where: { unassignedAt: null },
    include: { broker: { include: { user: { select: { id: true, name: true, email: true, avatar: true } } } } },
  },
} as const;

// SLA (Fase 4) é só cálculo — nunca persistido, sempre derivado da atribuição aberta na resposta.
function withSlaStatus<T extends { assignments: { assignedAt: Date; firstContactAt: Date | null }[] }>(
  lead: T
): T & { slaStatus: ReturnType<typeof computeSlaStatus> } {
  return { ...lead, slaStatus: computeSlaStatus(lead.assignments[0]) };
}

// ─── LEADS DA ORGANIZAÇÃO (requer OWNER/ADMIN/MANAGER) ───────────────────────────────────────

export async function getOrganizationLeads(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const membership = (request as FastifyRequest & { orgMembership: { organizationId: string } }).orgMembership;
  const { status } = request.query as { status?: string };

  const leads = await prisma.lead.findMany({
    where: {
      organizationId: membership.organizationId,
      ...(status ? { status } : {}),
    },
    include: LEAD_INCLUDE,
    orderBy: { createdAt: 'desc' },
  });

  return reply.send(leads.map(withSlaStatus));
}

// ─── MEUS LEADS (requer pertencer a uma organização, qualquer papel) ─────────────────────────

export async function getMyLeads(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { id: userId } = request.user as { id: string };

  const membership = await getMembership(userId);
  if (!membership) {
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

  const targetMember = await prisma.organizationMember.findUnique({ where: { id: parsed.data.brokerMemberId } });
  if (
    !targetMember ||
    targetMember.organizationId !== membership.organizationId ||
    !(ELIGIBLE_LEAD_ROLES as readonly string[]).includes(targetMember.role) ||
    targetMember.status !== 'ACTIVE'
  ) {
    return reply.status(400).send({ error: 'Escolha um corretor ou gerente ativo da sua organização.' });
  }

  const assignment = await assignLead({
    leadId,
    brokerMemberId: targetMember.id,
    assignedByMemberId: membership.id,
    reason: parsed.data.reason,
  });

  return reply.status(201).send(assignment);
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

  const [assignmentHistory, interactions, visits] = await Promise.all([
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
  ]);

  const currentAssignment = assignmentHistory.find((a) => a.unassignedAt === null) ?? null;
  const slaStatus = computeSlaStatus(currentAssignment);

  return reply.send({ ...lead, assignmentHistory, interactions, visits, slaStatus });
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
