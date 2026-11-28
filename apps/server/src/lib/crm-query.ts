import { z } from 'zod';
import type { OrganizationMember, Prisma } from '@prisma/client';
import { prisma } from './prisma.js';
import { workspaceLeadScope } from './workspace.js';
import { LEAD_SOURCES, LEAD_STATUSES, SLA_OVERDUE_HOURS, computeSlaStatus } from './leads.js';

/**
 * Filtros de oportunidades compartilhados por Contatos, Kanban e fila "Sem responsável" — todos
 * aplicam o MESMO escopo do papel (`workspaceLeadScope`) antes de filtrar, contar ou agregar.
 */
export const STAGE_GROUPS = {
  ALL: undefined,
  NEW: { status: 'NEW' },
  OPEN: { status: { in: ['CONTACTED', 'QUALIFIED', 'VISIT_SCHEDULED', 'PROPOSAL', 'NEGOTIATION'] } },
  ACTIVE: { status: { notIn: ['WON', 'LOST'] } },
  // Encerradas = ganhas ou perdidas (mesma regra de `CLOSED_LEAD_STATUSES`).
  CLOSED: { status: { in: ['WON', 'LOST'] } },
  WON: { status: 'WON' },
  LOST: { status: 'LOST' },
} as const;

export const leadFilterSchema = z.object({
  search: z.string().trim().max(120).optional(),
  stage: z.enum(['ALL', 'NEW', 'OPEN', 'ACTIVE', 'CLOSED', 'WON', 'LOST']).optional(),
  status: z.enum(LEAD_STATUSES).optional(),
  source: z.enum(LEAD_SOURCES).optional(),
  operationType: z.enum(['SALE', 'MONTHLY_RENT', 'DAILY_RENT']).optional(),
  brokerId: z.string().max(64).optional(),
  unassigned: z.enum(['true', 'false']).optional(),
  overdue: z.enum(['true', 'false']).optional(),
  buildingId: z.string().max(64).optional(),
  listingId: z.string().max(64).optional(),
  lostReason: z.string().max(40).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  activityFrom: z.string().datetime().optional(),
  activityTo: z.string().datetime().optional(),
});
export type LeadFilters = z.infer<typeof leadFilterSchema>;

const range = (from?: string, to?: string) =>
  from || to ? { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } : undefined;

/** Telefone pode ser buscado com ou sem pontuação: compara só dígitos. */
async function userIdsByPhone(search: string): Promise<string[]> {
  const digits = search.replace(/\D/g, '');
  if (digits.length < 4) return [];
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "User" WHERE "phone" IS NOT NULL AND regexp_replace("phone", '\\D', '', 'g') LIKE ${'%' + digits + '%'} LIMIT 500
  `;
  return rows.map((row) => row.id);
}

export async function buildLeadWhere(member: OrganizationMember, filters: LeadFilters): Promise<Prisma.LeadWhereInput> {
  const and: Prisma.LeadWhereInput[] = [workspaceLeadScope(member)];
  const stage = filters.stage ? STAGE_GROUPS[filters.stage] : undefined;
  if (stage) and.push(stage as Prisma.LeadWhereInput);
  if (filters.status) and.push({ status: filters.status });
  if (filters.source) and.push({ source: filters.source });
  if (filters.operationType) and.push({ listing: { operationType: filters.operationType } });
  if (filters.buildingId) and.push({ listing: { buildingId: filters.buildingId } });
  if (filters.listingId) and.push({ listingId: filters.listingId });
  if (filters.lostReason) and.push({ lostReason: filters.lostReason });
  if (filters.brokerId) and.push({ assignments: { some: { brokerId: filters.brokerId, unassignedAt: null } } });
  if (filters.unassigned === 'true') and.push({ assignments: { none: { unassignedAt: null } } });
  if (filters.overdue === 'true') {
    and.push({
      status: { notIn: ['WON', 'LOST'] },
      assignments: { some: { unassignedAt: null, firstContactAt: null, assignedAt: { lte: new Date(Date.now() - SLA_OVERDUE_HOURS * 3_600_000) } } },
    });
  }
  const created = range(filters.from, filters.to);
  if (created) and.push({ createdAt: created });
  const activity = range(filters.activityFrom, filters.activityTo);
  if (activity) and.push({ lastActivityAt: activity });
  if (filters.search) {
    const s = filters.search;
    const phoneIds = await userIdsByPhone(s);
    and.push({
      OR: [
        { user: { name: { contains: s, mode: 'insensitive' } } },
        { user: { email: { contains: s, mode: 'insensitive' } } },
        { listing: { name: { contains: s, mode: 'insensitive' } } },
        ...(phoneIds.length ? [{ userId: { in: phoneIds } }] : []),
      ],
    });
  }
  return { AND: and };
}

/** Linha de oportunidade usada em Contatos (visão Oportunidades, expansão de Pessoas e ficha). */
export function opportunitySelect(viewerUserId: string) {
  return {
    id: true,
    status: true,
    source: true,
    createdAt: true,
    lastActivityAt: true,
    closedAt: true,
    lostReason: true,
    lostNote: true,
    queuedAt: true,
    queueReason: true,
    userId: true,
    user: { select: { id: true, name: true, email: true, phone: true } },
    listing: { select: { id: true, name: true, operationType: true, building: { select: { id: true, name: true } } } },
    assignments: {
      where: { unassignedAt: null },
      select: { assignedAt: true, firstContactAt: true, source: true, broker: { select: { id: true, user: { select: { name: true } } } } },
    },
    tasks: { where: { completedAt: null }, orderBy: [{ dueAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }], take: 1, select: { id: true, title: true, dueAt: true } },
    visits: { where: { scheduledAt: { gte: new Date() }, status: { in: ['SCHEDULED', 'CONFIRMED'] } }, orderBy: { scheduledAt: 'asc' }, take: 1, select: { id: true, scheduledAt: true } },
    conversations: { where: { participants: { some: { id: viewerUserId } } }, select: { id: true }, take: 1 },
  } satisfies Prisma.LeadSelect;
}

type OpportunityRow = Prisma.LeadGetPayload<{ select: ReturnType<typeof opportunitySelect> }>;

/** Oportunidade visível (já dentro do escopo do papel) usada para resumir uma pessoa em Contatos. */
export type VisibleLeadSummaryRow = {
  id: string;
  userId: string;
  status: string;
  lastActivityAt: Date;
  listing: { id: string; name: string };
};

export type PersonSummary = {
  /** Imóvel da oportunidade visível com atividade mais recente (desempate por id, previsível). */
  primaryListing: { id: string; name: string; leadId: string } | null;
  /** Quantas outras oportunidades visíveis a pessoa tem além da principal ("+N"). */
  otherOpportunities: number;
  visibleOpportunities: number;
  openOpportunities: number;
  stages: Record<string, number>;
};

/**
 * Resume cada pessoa a partir SOMENTE das oportunidades que o usuário pode ver. Quem chama deve
 * passar linhas já filtradas por `workspaceLeadScope` — assim um corretor nunca recebe um "+1"
 * que revele a negociação de outra carteira.
 */
export function summarizePeople(rows: VisibleLeadSummaryRow[], userIds: string[]): Map<string, PersonSummary> {
  const byUser = new Map<string, VisibleLeadSummaryRow[]>();
  for (const row of rows) {
    const list = byUser.get(row.userId) ?? [];
    list.push(row);
    byUser.set(row.userId, list);
  }
  const result = new Map<string, PersonSummary>();
  for (const userId of userIds) {
    const list = [...(byUser.get(userId) ?? [])].sort(
      (a, b) => b.lastActivityAt.getTime() - a.lastActivityAt.getTime() || a.id.localeCompare(b.id)
    );
    const stages: Record<string, number> = {};
    for (const row of list) stages[row.status] = (stages[row.status] ?? 0) + 1;
    const first = list[0];
    result.set(userId, {
      primaryListing: first ? { id: first.listing.id, name: first.listing.name, leadId: first.id } : null,
      otherOpportunities: Math.max(0, list.length - 1),
      visibleOpportunities: list.length,
      openOpportunities: list.filter((row) => !['WON', 'LOST'].includes(row.status)).length,
      stages,
    });
  }
  return result;
}

export function toOpportunity(row: OpportunityRow) {
  const current = row.assignments[0] ?? null;
  const nextTask = row.tasks[0] ?? null;
  const nextVisit = row.visits[0] ?? null;
  const nextAction =
    nextVisit && (!nextTask?.dueAt || nextVisit.scheduledAt < nextTask.dueAt)
      ? { kind: 'VISIT' as const, at: nextVisit.scheduledAt, title: 'Visita' }
      : nextTask
        ? { kind: 'TASK' as const, at: nextTask.dueAt, title: nextTask.title }
        : null;
  return {
    id: row.id,
    status: row.status,
    source: row.source,
    createdAt: row.createdAt,
    lastActivityAt: row.lastActivityAt,
    closedAt: row.closedAt,
    lostReason: row.lostReason,
    lostNote: row.lostNote,
    queuedAt: row.queuedAt,
    queueReason: row.queueReason,
    customer: row.user,
    listing: { id: row.listing.id, name: row.listing.name, operationType: row.listing.operationType, building: row.listing.building },
    broker: current ? { memberId: current.broker.id, name: current.broker.user.name } : null,
    assignmentSource: current?.source ?? null,
    assignedAt: current?.assignedAt ?? null,
    firstContactAt: current?.firstContactAt ?? null,
    slaStatus: computeSlaStatus(current, row.status),
    nextAction,
    conversationId: row.conversations[0]?.id ?? null,
  };
}
