// Teste de integração contra o banco LOCAL (DATABASE_URL do .env): cria dados, exercita as rotas reais e apaga tudo no fim.
// Rodar: npx tsx tests/chat-close-block.db.ts
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import jwt from '@fastify/jwt';
import { prisma } from '../src/lib/prisma.js';
import { chatRoutes } from '../src/routes/chat.routes.js';

const app = Fastify();
await app.register(jwt, { secret: process.env.JWT_SECRET ?? 'x' });
await app.register(chatRoutes);
const tag = `blk${Date.now()}`;
const mk = (n: string) => prisma.user.create({ data: { name: `${n} ${tag}`, email: `${n}.${tag}@test.local` } });
const owner = await mk('owner'), broker = await mk('broker'), customer = await mk('customer'), person = await mk('person'), customer2 = await mk('customer2');
const org = await prisma.organization.create({ data: { name: `Imob ${tag}`, document: '1', members: { create: [{ userId: owner.id, role: 'OWNER' }, { userId: broker.id, role: 'BROKER' }] } } });
const orgListing = await prisma.listing.create({ data: { name: 'Apto org', price: 1, type: 'apartamento', category: 'venda', location: 'X', organizationId: org.id, status: 'APPROVED' } });
const orgListing2 = await prisma.listing.create({ data: { name: 'Casa org', price: 1, type: 'casa', category: 'venda', location: 'X', organizationId: org.id, status: 'APPROVED' } });
const personalListing = await prisma.listing.create({ data: { name: 'Casa PF', price: 1, type: 'casa', category: 'venda', location: 'X', ownerId: person.id, status: 'APPROVED' } });

const tok = (u: { id: string }, role = 'USER') => app.jwt.sign({ id: u.id, role, tokenVersion: 0 });
const call = (u: { id: string }, method: string, url: string, payload?: object) =>
  app.inject({ method: method as any, url, payload, headers: { authorization: `Bearer ${tok(u)}` } });

try {
  // Cliente abre conversa com a imobiliária; dono da imobiliária entra como participante.
  const conv = (await call(customer, 'POST', '/conversations', { listingId: orgListing.id })).json();
  await prisma.conversation.update({ where: { id: conv.id }, data: { participants: { connect: { id: owner.id } } } });

  let d = (await call(owner, 'GET', `/conversations/${conv.id}`)).json();
  assert.equal(d.canClose, true, 'imobiliária pode encerrar');
  d = (await call(customer, 'GET', `/conversations/${conv.id}`)).json();
  assert.equal(d.canClose, false, 'cliente não encerra');
  assert.equal((await call(customer, 'PATCH', `/conversations/${conv.id}/close`)).statusCode, 403);

  // Encerrar: mensagem automática + cliente vê canReopen
  assert.equal((await call(owner, 'PATCH', `/conversations/${conv.id}/close`)).statusCode, 200);
  const msgs = (await call(customer, 'GET', `/conversations/${conv.id}/messages`)).json();
  const closedMsg = msgs.find((m: any) => m.type === 'CONVERSATION_CLOSED');
  assert.ok(closedMsg && closedMsg.content.includes(`Imob ${tag}`), 'mensagem automática de encerramento');
  d = (await call(customer, 'GET', `/conversations/${conv.id}`)).json();
  assert.equal(d.isClosed, true); assert.equal(d.closedBy, 'LISTING'); assert.equal(d.canReopen, true);

  // Cliente reabre
  assert.equal((await call(customer, 'PATCH', `/conversations/${conv.id}/reopen`)).statusCode, 200);
  const msgs2 = (await call(owner, 'GET', `/conversations/${conv.id}/messages`)).json();
  assert.ok(msgs2.some((m: any) => m.type === 'CONVERSATION_REOPENED'), 'mensagem de reabertura');

  // Encerrada pela administração: cliente não reabre
  const admin = await prisma.user.create({ data: { name: 'admin', email: `admin.${tag}@test.local`, role: 'ADMIN' } });
  await app.inject({ method: 'PATCH', url: `/conversations/${conv.id}/close`, headers: { authorization: `Bearer ${tok(admin, 'ADMIN')}` } });
  d = (await call(customer, 'GET', `/conversations/${conv.id}`)).json();
  assert.equal(d.canReopen, false);
  assert.equal((await call(customer, 'PATCH', `/conversations/${conv.id}/reopen`)).statusCode, 403);
  await app.inject({ method: 'PATCH', url: `/conversations/${conv.id}/reopen`, headers: { authorization: `Bearer ${tok(admin, 'ADMIN')}` } });

  // Imóvel de pessoa física: não pode encerrar
  const pconv = (await call(customer2, 'POST', '/conversations', { listingId: personalListing.id })).json();
  assert.equal((await call(person, 'PATCH', `/conversations/${pconv.id}/close`)).statusCode, 403);

  // Imobiliária bloqueia o cliente → vale para a equipe toda e para outros imóveis dela
  const b = await call(owner, 'POST', `/conversations/${conv.id}/block`);
  assert.equal(b.statusCode, 201);
  assert.equal(b.json().blockedUserId, customer.id); assert.equal(b.json().blockerOrganizationId, org.id);
  d = (await call(customer, 'GET', `/conversations/${conv.id}`)).json();
  assert.equal(d.block.active, true); assert.equal(d.block.removableId, null, 'cliente não desfaz bloqueio da imobiliária');
  assert.equal((await call(customer, 'POST', '/conversations', { listingId: orgListing2.id })).statusCode, 403, 'bloqueado em outro imóvel da imobiliária');
  const blist = (await call(broker, 'GET', '/blocks')).json();
  assert.equal(blist.length, 1); assert.equal(blist[0].canRemove, false, 'corretor não desfaz bloqueio feito pelo dono');
  assert.equal((await call(broker, 'DELETE', `/blocks/${blist[0].id}`)).statusCode, 404);
  assert.equal((await call(owner, 'DELETE', `/blocks/${blist[0].id}`)).statusCode, 200);
  assert.equal((await call(customer, 'POST', '/conversations', { listingId: orgListing2.id })).statusCode, 201, 'desbloqueado');

  // Cliente bloqueia a imobiliária → nenhum lado consegue reabrir/conversar
  const cb = await call(customer, 'POST', `/conversations/${conv.id}/block`);
  assert.equal(cb.json().blockedOrganizationId, org.id);
  d = (await call(owner, 'GET', `/conversations/${conv.id}`)).json();
  assert.equal(d.block.active, true); assert.equal(d.block.removableId, null);
  await call(owner, 'PATCH', `/conversations/${conv.id}/close`);
  assert.equal((await call(owner, 'PATCH', `/conversations/${conv.id}/reopen`)).statusCode, 403, 'bloqueada não reabre');
  const mine = (await call(customer, 'GET', '/blocks')).json();
  assert.equal(mine[0].target.kind, 'ORGANIZATION'); assert.equal(mine[0].canRemove, true);

  // Bloqueio pessoal (imóvel PF)
  const pb = await call(person, 'POST', `/conversations/${pconv.id}/block`);
  assert.equal(pb.json().blockedUserId, customer2.id); assert.equal(pb.json().blockerOrganizationId, null);
  assert.equal((await call(person, 'POST', `/conversations/${pconv.id}/block`)).statusCode, 200, 'idempotente');
  d = (await call(customer2, 'GET', `/conversations/${pconv.id}`)).json();
  assert.equal(d.block.active, true); assert.equal(d.canBlock, false);

  console.log('PASS: encerrar/reabrir (imobiliária, cliente, administração, PF) e bloqueios (imobiliária, cliente, pessoal, desfazer, permissões).');
} finally {
  await prisma.message.deleteMany({ where: { conversation: { propertyId: { in: [orgListing.id, orgListing2.id, personalListing.id] } } } });
  await prisma.conversation.deleteMany({ where: { propertyId: { in: [orgListing.id, orgListing2.id, personalListing.id] } } });
  await prisma.lead.deleteMany({ where: { organizationId: org.id } });
  await prisma.listing.deleteMany({ where: { id: { in: [orgListing.id, orgListing2.id, personalListing.id] } } });
  await prisma.organizationMember.deleteMany({ where: { organizationId: org.id } });
  await prisma.organization.delete({ where: { id: org.id } }).catch(() => {});
  await prisma.notification.deleteMany({ where: { user: { email: { endsWith: `${tag}@test.local` } } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: `${tag}@test.local` } } });
  await app.close(); await prisma.$disconnect();
}
