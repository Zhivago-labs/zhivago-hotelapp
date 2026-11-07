import type { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { workspaceMembership, workspaceLeadScope, workspaceListingScope, WORKSPACE_READ_ALL } from '../lib/workspace.js';

export async function getWorkspace(request: FastifyRequest, reply: FastifyReply) {
  const member = await workspaceMembership(request);
  if (!member) return reply.status(403).send({ error: 'Vínculo ativo com uma imobiliária necessário.' });
  const parsed = z.object({ days: z.coerce.number().refine(n => [7, 30, 90].includes(n)).default(30) }).safeParse(request.query);
  if (!parsed.success) return reply.status(400).send({ error: 'Período inválido.' });
  const days = parsed.data.days;
  const since = new Date(Date.now() - days * 86400000);
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  const scope = workspaceLeadScope(member);
  const listingScope = workspaceListingScope(member);
  const [leads, listings, visits, seasonCount, upcomingBookings] = await Promise.all([
    prisma.lead.findMany({ where: { ...scope, createdAt: { gte: since } }, select: { id: true, userId: true, status: true, createdAt: true, assignments: { select: { firstContactAt: true } } } }),
    prisma.listing.findMany({ where: listingScope, select: { id: true, name: true, status: true, viewCount: true, _count: { select: { leads: true } } }, orderBy: { viewCount: 'desc' } }),
    prisma.visit.findMany({ where: { lead: scope, scheduledAt: { gte: new Date() }, status: { in: ['SCHEDULED', 'CONFIRMED'] } }, include: { lead: { select: { id: true, user: { select: { name: true } }, listing: { select: { name: true } } } } }, orderBy: { scheduledAt: 'asc' }, take: 8 }),
    prisma.listing.count({ where: { organizationId: member.organizationId, operationType: 'DAILY_RENT' } }),
    prisma.booking.findMany({ where: {
      listing: { organizationId: member.organizationId, operationType: 'DAILY_RENT' },
      ...(!WORKSPACE_READ_ALL.includes(member.role) ? { lead: scope } : {}),
      startDate: { gte: today }, status: { in: ['PENDING', 'CONFIRMED'] },
    }, select: { id: true, startDate: true, status: true, user: { select: { name: true } }, listing: { select: { name: true } } }, orderBy: { startDate: 'asc' }, take: 5 }),
  ]);
  const pending = await prisma.lead.findMany({ where: { ...scope, status: { notIn: ['WON', 'LOST'] }, OR: [{ status: 'NEW' }, { assignments: { none: { unassignedAt: null } } }] }, select: { id: true, status: true, user: { select: { name: true } }, listing: { select: { name: true } } }, orderBy: { createdAt: 'asc' }, take: 8 });
  const pendingCount = await prisma.lead.count({ where: { ...scope, status: { notIn: ['WON', 'LOST'] }, OR: [{ status: 'NEW' }, { assignments: { none: { unassignedAt: null } } }] } });
  const trend: Record<string, number> = {};
  for (const lead of leads) { const key = lead.createdAt.toISOString().slice(0, 10); trend[key] = (trend[key] ?? 0) + 1; }
  const contacted = leads.filter(lead => lead.assignments.some(a => a.firstContactAt !== null)).length;
  return reply.send({ days, since, scope: WORKSPACE_READ_ALL.includes(member.role) ? 'organization' : 'assigned',
    newLeads: leads.length, uniqueContacts: new Set(leads.map(lead => lead.userId)).size,
    pendingCount, contactedRate: leads.length ? contacted / leads.length : null,
    published: listings.filter(item => item.status === 'APPROVED').length,
    topListings: listings.slice(0, 5), topContactListings: [...listings].sort((a,b) => b._count.leads - a._count.leads).slice(0, 5),
    pending, visits, trend, upcomingBookings, hasSeason: seasonCount > 0,
  });
}

// A contact is a registered customer with at least one visible opportunity in this organization.
// Identity uses userId only; names, phone numbers and email similarities never merge records.
export async function getWorkspaceContacts(request: FastifyRequest, reply: FastifyReply) {
  const member = await workspaceMembership(request);
  if (!member) return reply.status(403).send({ error: 'Vínculo ativo necessário.' });
  const parsed = z.object({ search: z.string().trim().max(120).default(''), page: z.coerce.number().int().positive().default(1) }).safeParse(request.query);
  if (!parsed.success) return reply.status(400).send({ error: 'Filtros inválidos.' });
  const { search, page } = parsed.data;
  const leadScope = workspaceLeadScope(member);
  const where = { leads: { some: leadScope }, ...(search ? { OR: [{ name: { contains: search, mode: 'insensitive' as const } }, { email: { contains: search, mode: 'insensitive' as const } }] } : {}) };
  const [total, items] = await prisma.$transaction([
    prisma.user.count({ where }),
    prisma.user.findMany({ where, orderBy: [{ name: 'asc' }, { id: 'asc' }], skip: (page - 1) * 25, take: 25,
      select: { id: true, name: true, email: true, phone: true, leads: { where: leadScope, select: { id: true, status: true, listing: { select: { id: true, name: true } }, conversations: { where: { participants: { some: { id: member.userId } } }, select: { id: true } } }, orderBy: { createdAt: 'desc' } } } }),
  ]);
  return reply.send({ items, total, page, limit: 25 });
}

export async function getWorkspaceMessages(request: FastifyRequest, reply: FastifyReply) {
  const member = await workspaceMembership(request);
  if (!member) return reply.status(403).send({ error: 'Vínculo ativo necessário.' });
  const items = await prisma.conversation.findMany({ where: { lead: workspaceLeadScope(member), participants: { some: { id: member.userId } } },
    select: { id: true, isClosed: true, property: { select: { name: true } }, lead: { select: { user: { select: { name: true } } } }, messages: { orderBy: { createdAt: 'desc' }, take: 1, select: { content: true, createdAt: true } } }, orderBy: { updatedAt: 'desc' }, take: 100 });
  return reply.send(items);
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
