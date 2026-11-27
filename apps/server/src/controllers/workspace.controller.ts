import type { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { workspaceMembership, workspaceLeadScope, workspaceListingScope, workspaceConversationScope, WORKSPACE_READ_ALL } from '../lib/workspace.js';
import { buildLeadWhere, leadFilterSchema, opportunitySelect, toOpportunity } from '../lib/crm-query.js';
import { SLA_OVERDUE_HOURS, computeSlaStatus } from '../lib/leads.js';

const OPEN = { status: { notIn: ['WON', 'LOST'] } };

/**
 * Início: indicadores do período + blocos operacionais (novos sem resposta, sem responsável, SLA
 * vencido, próximas tarefas, visitas de hoje). Gestão começa na visão da equipe e pode alternar
 * para a própria carteira (`mine=true`); corretor sempre vê a própria carteira.
 */
export async function getWorkspace(request: FastifyRequest, reply: FastifyReply) {
  const member = await workspaceMembership(request);
  if (!member) return reply.status(403).send({ error: 'Vínculo ativo com uma imobiliária necessário.' });
  const parsed = z
    .object({ days: z.coerce.number().refine((n) => [7, 30, 90].includes(n)).default(30), mine: z.enum(['true', 'false']).optional() })
    .safeParse(request.query);
  if (!parsed.success) return reply.status(400).send({ error: 'Período inválido.' });
  const days = parsed.data.days;
  const broad = WORKSPACE_READ_ALL.includes(member.role);
  const mine = !broad || parsed.data.mine === 'true';
  const since = new Date(Date.now() - days * 86400000);
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(startOfDay.getTime() + 86400000);
  const scope: Prisma.LeadWhereInput = mine
    ? { organizationId: member.organizationId, assignments: { some: { brokerId: member.id, unassignedAt: null } } }
    : workspaceLeadScope(member);
  const listingScope = workspaceListingScope(member);
  const overdueCut = new Date(Date.now() - SLA_OVERDUE_HOURS * 3_600_000);
  const leadCard = { id: true, status: true, createdAt: true, user: { select: { name: true } }, listing: { select: { name: true } } } as const;

  const [leads, listings, visits, seasonCount, upcomingBookings, newNoResponse, newNoResponseCount, unassigned, unassignedCount, overdue, overdueCount, tasks, visitsToday] = await Promise.all([
    prisma.lead.findMany({ where: { ...scope, createdAt: { gte: since } }, select: { id: true, userId: true, status: true, createdAt: true, assignments: { select: { firstContactAt: true } } } }),
    prisma.listing.findMany({ where: listingScope, select: { id: true, name: true, status: true, viewCount: true, _count: { select: { leads: true } } }, orderBy: { viewCount: 'desc' } }),
    prisma.visit.findMany({ where: { lead: scope, scheduledAt: { gte: new Date() }, status: { in: ['SCHEDULED', 'CONFIRMED'] } }, include: { lead: { select: { id: true, user: { select: { name: true } }, listing: { select: { name: true } } } } }, orderBy: { scheduledAt: 'asc' }, take: 8 }),
    prisma.listing.count({ where: { organizationId: member.organizationId, operationType: 'DAILY_RENT' } }),
    prisma.booking.findMany({
      where: {
        listing: { organizationId: member.organizationId, operationType: 'DAILY_RENT' },
        ...(mine ? { lead: scope } : {}),
        startDate: { gte: today }, status: { in: ['PENDING', 'CONFIRMED'] },
      },
      select: { id: true, startDate: true, status: true, user: { select: { name: true } }, listing: { select: { name: true } } }, orderBy: { startDate: 'asc' }, take: 5,
    }),
    prisma.lead.findMany({ where: { ...scope, status: 'NEW', assignments: { some: { unassignedAt: null, firstContactAt: null } } }, select: leadCard, orderBy: { createdAt: 'asc' }, take: 6 }),
    prisma.lead.count({ where: { ...scope, status: 'NEW', assignments: { some: { unassignedAt: null, firstContactAt: null } } } }),
    mine ? Promise.resolve([]) : prisma.lead.findMany({ where: { ...scope, ...OPEN, assignments: { none: { unassignedAt: null } } }, select: leadCard, orderBy: { createdAt: 'asc' }, take: 6 }),
    mine ? Promise.resolve(0) : prisma.lead.count({ where: { ...scope, ...OPEN, assignments: { none: { unassignedAt: null } } } }),
    prisma.lead.findMany({ where: { ...scope, ...OPEN, assignments: { some: { unassignedAt: null, firstContactAt: null, assignedAt: { lte: overdueCut } } } }, select: leadCard, orderBy: { createdAt: 'asc' }, take: 6 }),
    prisma.lead.count({ where: { ...scope, ...OPEN, assignments: { some: { unassignedAt: null, firstContactAt: null, assignedAt: { lte: overdueCut } } } } }),
    prisma.leadTask.findMany({
      where: {
        completedAt: null,
        lead: { ...scope, ...OPEN },
        ...(mine ? { OR: [{ assigneeId: member.id }, { assigneeId: null, memberId: member.id }, { assigneeId: null, lead: { assignments: { some: { brokerId: member.id, unassignedAt: null } } } }] } : {}),
      },
      select: { id: true, title: true, dueAt: true, lead: { select: { id: true, user: { select: { name: true } }, listing: { select: { name: true } } } } },
      orderBy: [{ dueAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
      take: 6,
    }),
    prisma.visit.findMany({
      where: { lead: scope, scheduledAt: { gte: startOfDay, lt: endOfDay }, status: { in: ['SCHEDULED', 'CONFIRMED'] }, ...(mine ? { brokerId: member.id } : {}) },
      include: { lead: { select: { id: true, user: { select: { name: true } }, listing: { select: { name: true } } } } },
      orderBy: { scheduledAt: 'asc' },
    }),
  ]);
  const pendingWhere = { ...scope, ...OPEN, OR: [{ status: 'NEW' }, { assignments: { none: { unassignedAt: null } } }] };
  const [pending, pendingCount] = await Promise.all([
    prisma.lead.findMany({ where: pendingWhere, select: { id: true, status: true, user: { select: { name: true } }, listing: { select: { name: true } } }, orderBy: { createdAt: 'asc' }, take: 8 }),
    prisma.lead.count({ where: pendingWhere }),
  ]);
  const trend: Record<string, number> = {};
  for (const lead of leads) { const key = lead.createdAt.toISOString().slice(0, 10); trend[key] = (trend[key] ?? 0) + 1; }
  const contacted = leads.filter((lead) => lead.assignments.some((a) => a.firstContactAt !== null)).length;
  return reply.send({
    days, since, scope: mine ? 'assigned' : 'organization', canSwitchScope: broad,
    newLeads: leads.length, uniqueContacts: new Set(leads.map((lead) => lead.userId)).size,
    pendingCount, contactedRate: leads.length ? contacted / leads.length : null,
    published: listings.filter((item) => item.status === 'APPROVED').length,
    topListings: listings.slice(0, 5), topContactListings: [...listings].sort((a, b) => b._count.leads - a._count.leads).slice(0, 5),
    pending, visits, trend, upcomingBookings, hasSeason: seasonCount > 0,
    blocks: {
      newNoResponse: { count: newNoResponseCount, items: newNoResponse },
      unassigned: { count: unassignedCount, items: unassigned },
      overdue: { count: overdueCount, items: overdue },
      tasks: { items: tasks },
      visitsToday: { count: visitsToday.length, items: visitsToday },
    },
  });
}

// ─── CONTATOS ────────────────────────────────────────────────────────────────────────────────

const CONTACTS_PAGE = 25;
const contactsQuery = leadFilterSchema.extend({
  view: z.enum(['people', 'opportunities']).default('people'),
  sort: z.enum(['activity', 'name', 'created', 'nextAction', 'waiting']).default('activity'),
  page: z.coerce.number().int().positive().default(1),
});

/**
 * Contatos como base histórica: visão Pessoas (uma linha por `userId`, com as oportunidades que
 * atendem ao filtro) e visão Oportunidades (uma linha por `leadId`, que precisa atender a todos os
 * filtros). Escopo do papel aplicado antes de filtrar/contar. Totais de pessoas e de
 * oportunidades sempre separados. Identidade só por `userId` — nomes/telefones iguais não fundem.
 */
export async function getWorkspaceContacts(request: FastifyRequest, reply: FastifyReply) {
  const member = await workspaceMembership(request);
  if (!member) return reply.status(403).send({ error: 'Vínculo ativo necessário.' });
  const parsed = contactsQuery.safeParse(request.query);
  if (!parsed.success) return reply.status(400).send({ error: 'Filtros inválidos.' });
  const { view, sort, page, ...filters } = parsed.data;
  const where = await buildLeadWhere(member, filters);
  const select = opportunitySelect(member.userId);
  const skip = (page - 1) * CONTACTS_PAGE;

  const [opportunityTotal, peopleGroups] = await Promise.all([
    prisma.lead.count({ where }),
    prisma.lead.groupBy({ by: ['userId'], where, _max: { lastActivityAt: true }, _min: { createdAt: true }, _count: { _all: true } }),
  ]);
  const peopleTotal = peopleGroups.length;

  if (view === 'opportunities') {
    let rows;
    if (sort === 'nextAction' || sort === 'waiting') {
      // Ordenações derivadas: calcula a chave para todas as oportunidades do filtro e pagina por ID.
      const keys = await prisma.lead.findMany({
        where,
        select: {
          id: true, createdAt: true, queuedAt: true,
          assignments: { where: { unassignedAt: null }, select: { assignedAt: true, firstContactAt: true } },
          tasks: { where: { completedAt: null, dueAt: { not: null } }, orderBy: { dueAt: 'asc' }, take: 1, select: { dueAt: true } },
          visits: { where: { scheduledAt: { gte: new Date() }, status: { in: ['SCHEDULED', 'CONFIRMED'] } }, orderBy: { scheduledAt: 'asc' }, take: 1, select: { scheduledAt: true } },
        },
      });
      const keyOf = (k: (typeof keys)[number]) => {
        if (sort === 'nextAction') {
          const times = [k.tasks[0]?.dueAt?.getTime(), k.visits[0]?.scheduledAt.getTime()].filter((t): t is number => t !== undefined);
          return times.length ? Math.min(...times) : Number.POSITIVE_INFINITY;
        }
        const a = k.assignments[0];
        if (a?.firstContactAt) return Number.POSITIVE_INFINITY; // já respondida vai para o fim
        return (a?.assignedAt ?? k.queuedAt ?? k.createdAt).getTime(); // esperando há mais tempo primeiro
      };
      const ordered = keys.map((k) => ({ id: k.id, key: keyOf(k) })).sort((a, b) => a.key - b.key || a.id.localeCompare(b.id));
      const pageIds = ordered.slice(skip, skip + CONTACTS_PAGE).map((k) => k.id);
      const fetched = await prisma.lead.findMany({ where: { id: { in: pageIds } }, select });
      rows = pageIds.map((id) => fetched.find((row) => row.id === id)!).filter(Boolean);
    } else {
      const orderBy: Prisma.LeadOrderByWithRelationInput[] =
        sort === 'name' ? [{ user: { name: 'asc' } }, { id: 'asc' }]
          : sort === 'created' ? [{ createdAt: 'desc' }, { id: 'asc' }]
            : [{ lastActivityAt: 'desc' }, { id: 'asc' }];
      rows = await prisma.lead.findMany({ where, select, orderBy, skip, take: CONTACTS_PAGE });
    }
    return reply.send({ view, sort, page, limit: CONTACTS_PAGE, peopleTotal, opportunityTotal, total: opportunityTotal, items: rows.map(toOpportunity) });
  }

  // Visão Pessoas: ordena os grupos por cliente e pagina.
  let pageUserIds: string[];
  if (sort === 'name') {
    const users = await prisma.user.findMany({
      where: { id: { in: peopleGroups.map((g) => g.userId) } },
      select: { id: true }, orderBy: [{ name: 'asc' }, { id: 'asc' }], skip, take: CONTACTS_PAGE,
    });
    pageUserIds = users.map((u) => u.id);
  } else {
    const ordered = [...peopleGroups].sort((a, b) => {
      const ka = sort === 'created' ? a._min.createdAt!.getTime() : a._max.lastActivityAt!.getTime();
      const kb = sort === 'created' ? b._min.createdAt!.getTime() : b._max.lastActivityAt!.getTime();
      return kb - ka || a.userId.localeCompare(b.userId);
    });
    pageUserIds = ordered.slice(skip, skip + CONTACTS_PAGE).map((g) => g.userId);
  }

  const scope = workspaceLeadScope(member);
  const [users, matched, visibleCounts] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: pageUserIds } }, select: { id: true, name: true, email: true, phone: true } }),
    prisma.lead.findMany({ where: { AND: [where, { userId: { in: pageUserIds } }] }, select, orderBy: [{ lastActivityAt: 'desc' }, { id: 'asc' }] }),
    prisma.lead.groupBy({ by: ['userId', 'status'], where: { AND: [scope, { userId: { in: pageUserIds } }] }, _count: { _all: true } }),
  ]);
  const items = pageUserIds.map((id) => {
    const user = users.find((u) => u.id === id)!;
    const group = peopleGroups.find((g) => g.userId === id)!;
    const stages: Record<string, number> = {};
    for (const row of visibleCounts.filter((r) => r.userId === id)) stages[row.status] = row._count._all;
    return {
      ...user,
      lastActivityAt: group._max.lastActivityAt,
      firstEntryAt: group._min.createdAt,
      visibleOpportunities: Object.values(stages).reduce((sum, n) => sum + n, 0),
      matchedOpportunities: group._count._all,
      stages,
      opportunities: matched.filter((row) => row.userId === id).map(toOpportunity),
    };
  });
  return reply.send({ view, sort, page, limit: CONTACTS_PAGE, peopleTotal, opportunityTotal, total: peopleTotal, items });
}

/** Ficha do contato: todas as oportunidades autorizadas da pessoa. Sem nenhuma visível → 404. */
export async function getWorkspaceContact(request: FastifyRequest, reply: FastifyReply) {
  const member = await workspaceMembership(request);
  if (!member) return reply.status(403).send({ error: 'Vínculo ativo necessário.' });
  const { userId } = request.params as { userId: string };
  const leads = await prisma.lead.findMany({
    where: { AND: [workspaceLeadScope(member), { userId }] },
    select: opportunitySelect(member.userId),
    orderBy: [{ lastActivityAt: 'desc' }, { id: 'asc' }],
  });
  if (!leads.length) return reply.status(404).send({ error: 'Contato não encontrado.' });
  const [user, entries] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true, phone: true, avatar: true, createdAt: true } }),
    prisma.leadEntry.findMany({ where: { leadId: { in: leads.map((l) => l.id) } }, orderBy: { createdAt: 'desc' }, take: 30, select: { id: true, leadId: true, source: true, kind: true, createdAt: true, note: true } }),
  ]);
  const opportunities = leads.map(toOpportunity);
  return reply.send({
    contact: user,
    opportunities,
    entries,
    lastActivityAt: opportunities[0]?.lastActivityAt ?? null,
    canMutate: member.role !== 'ASSISTANT',
  });
}

export async function getWorkspaceMessages(request: FastifyRequest, reply: FastifyReply) {
  const member = await workspaceMembership(request);
  if (!member) return reply.status(403).send({ error: 'Vínculo ativo necessário.' });
  const items = await prisma.conversation.findMany({
    where: workspaceConversationScope(member),
    select: {
      id: true, isClosed: true, property: { select: { name: true } },
      lead: { select: { id: true, status: true, user: { select: { name: true } }, assignments: { where: { unassignedAt: null }, select: { assignedAt: true, firstContactAt: true } } } },
      messages: { orderBy: { createdAt: 'desc' }, take: 1, select: { content: true, createdAt: true } },
    },
    orderBy: { updatedAt: 'desc' }, take: 100,
  });
  return reply.send(items.map((item) => ({
    ...item,
    lead: item.lead ? { id: item.lead.id, status: item.lead.status, user: item.lead.user, slaStatus: computeSlaStatus(item.lead.assignments?.[0], item.lead.status) } : null,
  })));
}

export async function getWorkspaceBookings(request: FastifyRequest, reply: FastifyReply) {
  const member = await workspaceMembership(request);
  if (!member) return reply.status(403).send({ error: 'Vínculo ativo necessário.' });
  const parsed = z.object({ page: z.coerce.number().int().positive().default(1), search: z.string().max(120).default('') }).safeParse(request.query);
  if (!parsed.success) return reply.status(400).send({ error: 'Filtros inválidos.' });
  const { page, search } = parsed.data;
  const scope = workspaceLeadScope(member);
  const where = { listing: { organizationId: member.organizationId, operationType: 'DAILY_RENT' },
    ...(!WORKSPACE_READ_ALL.includes(member.role) ? { lead: scope } : {}),
    ...(search ? { OR: [{ user: { name: { contains: search, mode: 'insensitive' as const } } }, { listing: { name: { contains: search, mode: 'insensitive' as const } } }] } : {}),
  };
  const [total, bookings] = await prisma.$transaction([
    prisma.booking.count({ where }), prisma.booking.findMany({ where, skip: (page - 1) * 20, take: 20, orderBy: { startDate: 'desc' },
      include: { listing: { select: { id: true, name: true, price: true, images: { take: 1, orderBy: { order: 'asc' } } } }, user: { select: { name: true, avatar: true, email: true, phone: true } } } }),
  ]);
  return reply.send({ total, page, totalPages: Math.max(1, Math.ceil(total / 20)), bookings: bookings.map(booking => ({ ...booking, price: booking.price ?? booking.listing.price, listing: { ...booking.listing, image: booking.listing.images[0]?.url ?? null } })) });
}
