import assert from 'node:assert/strict';
import Fastify from 'fastify';
import jwt from '@fastify/jwt';
import { prisma } from '../src/lib/prisma.js';
import { organizationsRoutes } from '../src/routes/organizations.routes.js';
import { leadsRoutes } from '../src/routes/leads.routes.js';
import { usersRoutes } from '../src/routes/users.routes.js';
import { updateMe } from '../src/controllers/auth.controller.js';
import { authenticate } from '../src/middlewares/authenticate.js';
import { listingsRoutes } from '../src/routes/listings.routes.js';
import { canManageOrgListing, myListingsWhere } from '../src/controllers/listings.controller.js';

// Isolated repository tests: mock persistence only, exercise actual routes/auth/policies.
const app = Fastify();
await app.register(jwt, { secret: 'workspace-test-only' });
let role = 'OWNER', state = 'ACTIVE';
let target = { id: 'member-target', userId: 'target', role: 'BROKER', status: 'ACTIVE', organizationId: 'org-a' };
const member = () => ({ id: 'member-viewer', userId: 'viewer', organizationId: 'org-a', role, status: state });
const seen: any[] = [], mutations: any[] = [];
(prisma.user.findUnique as any) = async () => ({ id: 'viewer', email: 'viewer@example.test', role: 'USER', status: 'ACTIVE', tokenVersion: 0, accountType: 'AGENCY' });
(prisma.user.update as any) = async (args: any) => { mutations.push({ kind: 'personal', ...args }); return {}; };
(prisma.organization.update as any) = async (args: any) => { mutations.push({ kind: 'company', ...args }); return {}; };
(prisma.organizationMember.findUnique as any) = async ({ where }: any) => where.userId === 'target' ? target : member();
(prisma.organizationMember.findFirst as any) = async () => ({ id: 'member-owner', userId: 'owner', role: 'OWNER', status: 'ACTIVE', organizationId: 'org-a' });
(prisma.$transaction as any) = async (ops: any[]) => Promise.all(ops);
(prisma.lead.findMany as any) = async (args: any) => {
  seen.push(args);
  if (args.select) return Array.from({ length: 150 }, (_, i) => ({ status: i < 120 ? 'NEW' : 'WON', assignments: [] }));
  return Array.from({ length: 100 }, (_, i) => ({ id: `lead-${i}`, status: 'NEW', assignments: [], tasks: [] }));
};
(prisma.lead.count as any) = async (args: any) => { seen.push(args); return 200; };
(prisma.user.count as any) = async (args: any) => { seen.push(args); return 1; };
(prisma.user.findMany as any) = async (args: any) => { seen.push(args); return [{ id: 'customer', name: 'Cliente', email: 'customer@example.test', phone: null, leads: [{ id: 'lead-one', listing: { id: 'listing-one', name: 'Imóvel um' } }, { id: 'lead-two', listing: { id: 'listing-two', name: 'Imóvel dois' } }] }]; };
(prisma.listing.findMany as any) = async (args: any) => { seen.push(args); return []; };
(prisma.listing.findUnique as any) = async () => ({ id: 'listing-own', ownerId: null, organizationId: 'org-a', agentId: 'viewer', status: 'APPROVED' });
(prisma.listing.updateMany as any) = async (args: any) => { mutations.push({ kind: 'listing', ...args }); return { count: 1 }; };
(prisma.organizationMember.update as any) = async (args: any) => { mutations.push({ kind: 'member', ...args }); return {}; };
(prisma.leadAssignment.findMany as any) = async () => [{ lead: { id: 'lead-history', userId: 'customer', listingId: 'listing-one' } }];
(prisma.leadAssignment.findFirst as any) = async () => ({ id: 'assignment-old' });
(prisma.leadAssignment.update as any) = async (args: any) => { mutations.push({ kind: 'assignment-close', ...args }); return {}; };
(prisma.leadAssignment.create as any) = async (args: any) => { mutations.push({ kind: 'assignment-create', ...args }); return { id: 'assignment-new' }; };
(prisma.conversation.findFirst as any) = async () => ({ id: 'conversation-kept', participants: [{ id: 'customer' }, { id: 'target' }] });
(prisma.conversation.update as any) = async (args: any) => { mutations.push({ kind: 'conversation-members', ...args }); return {}; };
await app.register(organizationsRoutes); await app.register(leadsRoutes);
await app.register(usersRoutes);
await app.register(listingsRoutes);
app.patch('/auth/me', { preHandler: [authenticate] }, updateMe);
const token = app.jwt.sign({ id: 'viewer', tokenVersion: 0 });
const request = (url: string, method: 'GET' | 'DELETE' = 'GET') => app.inject({ method, url, headers: { authorization: `Bearer ${token}` } });
try {
  assert.equal((await app.inject('/organizations/contacts')).statusCode, 401);
  state = 'INACTIVE';
  assert.equal((await request('/organizations/contacts')).statusCode, 403);
  assert.equal((await request('/leads/workspace')).statusCode, 403);
  assert.equal((await request('/organizations/my-assigned-listings')).statusCode, 404);
  assert.equal(await canManageOrgListing('viewer', { organizationId: 'org-a', agentId: 'viewer' }), false);
  state = 'ACTIVE';
  for (const testRole of ['OWNER', 'ADMIN', 'MANAGER', 'ASSISTANT', 'BROKER']) {
    role = testRole;
    assert.equal(await canManageOrgListing('viewer', { organizationId: 'org-b', agentId: 'viewer' }), false);
    assert.equal(await canManageOrgListing('viewer', { organizationId: 'org-a', agentId: 'viewer' }), ['OWNER', 'ADMIN', 'BROKER'].includes(role));
    const result = await request('/leads/workspace?limit=100&page=2&status=NEW&brokerId=foreign-id&listingId=foreign-listing');
    assert.equal(result.statusCode, 200);
    const body = result.json();
    assert.equal(body.items.length, 100); assert.equal(body.total, 150);
    assert.equal(body.summary.active, 120); assert.equal(body.summary.unassigned, 120);
    assert.equal(body.summary.byStatus.NEW, 120); assert.equal(body.allTotal, 200);
    const where = seen.findLast(args => args.where?.AND)?.where;
    assert.equal(where.AND[0].organizationId, 'org-a');
    if (role === 'BROKER') assert.deepEqual(where.AND[0].assignments, { some: { brokerId: 'member-viewer', unassignedAt: null } });
  }
  assert.equal((await request('/leads/workspace?page=-1')).statusCode, 400);
  assert.equal((await request('/leads/workspace?from=not-a-date')).statusCode, 400);
  role = 'BROKER';
  assert.equal((await app.inject({ method: 'PUT', url: '/listings/listing-own', headers: { authorization: `Bearer ${token}` }, payload: { assignedAgentId: 'target' } })).statusCode, 403, 'editing a listing must not bypass responsibility redistribution policy');
  role = 'MANAGER';
  for (const url of ['/listings', '/listings/import']) {
    assert.equal((await app.inject({ method: 'POST', url, headers: { authorization: `Bearer ${token}` }, payload: {} })).statusCode, 403);
  }
  role = 'BROKER';
  const contacts = await request('/organizations/contacts');
  assert.equal(contacts.statusCode, 200); assert.equal(contacts.json().total, 1); assert.equal(contacts.json().items[0].leads.length, 2);
  const contactQuery = seen.findLast(args => args.select?.leads);
  assert.equal(contactQuery.where.leads.some.organizationId, 'org-a');
  assert.equal(contactQuery.select.leads.where.organizationId, 'org-a');
  assert.deepEqual(await myListingsWhere('viewer'), { organizationId: 'org-a', agentId: 'viewer' });
  role = 'BROKER'; assert.equal((await request('/organizations/members/target', 'DELETE')).statusCode, 403);
  role = 'OWNER'; target = { ...target, organizationId: 'org-b' };
  const headers = { authorization: `Bearer ${token}` };
  assert.equal((await app.inject({ method: 'PATCH', url: '/auth/me', headers, payload: { name: 'Nome pessoal alterado' } })).statusCode, 200);
  assert.deepEqual(mutations.find(m => m.kind === 'personal').data, { name: 'Nome pessoal alterado' });
  assert.equal((await app.inject({ method: 'PATCH', url: '/users/me/showcase', headers, payload: {
    name: 'Empresa alterada', logo: null, coverUrl: null, description: null, publicLocation: null, phone: null, email: null,
    legalName: 'Razão social interna', address: 'Endereço interno', whatsapp: null, businessHours: null,
  } })).statusCode, 200);
  const companyWrite = mutations.find(m => m.kind === 'company');
  assert.equal(companyWrite.where.id, 'org-a');
  assert.equal(companyWrite.data.name, 'Empresa alterada');
  assert.equal('avatar' in companyWrite.data, false);
  assert.equal('passwordHash' in companyWrite.data, false);
  assert.equal((await request('/organizations/members/target', 'DELETE')).statusCode, 404);
  target = { ...target, organizationId: 'org-a', role: 'OWNER' };
  assert.equal((await request('/organizations/members/target', 'DELETE')).statusCode, 400);
  target = { ...target, role: 'BROKER' };
  assert.equal((await request('/organizations/members/target', 'DELETE')).statusCode, 200);
  assert.equal(mutations.find(m => m.kind === 'member').data.status, 'INACTIVE');
  assert.equal(mutations.find(m => m.kind === 'listing').data.agentId, 'owner');
  assert.equal(mutations.find(m => m.kind === 'assignment-close').where.id, 'assignment-old');
  assert.equal(mutations.find(m => m.kind === 'assignment-create').data.leadId, 'lead-history');
  assert.equal(mutations.find(m => m.kind === 'assignment-create').data.brokerId, 'member-owner');
  assert.equal(mutations.find(m => m.kind === 'conversation-members').where.id, 'conversation-kept');
  console.log('PASS: active membership, five roles, tenant scope, filtered totals across pages, one contact with two opportunities, owner protection, soft removal, listing reassignment, assignment history and conversation preservation.');
} finally { await app.close(); await prisma.$disconnect(); }
