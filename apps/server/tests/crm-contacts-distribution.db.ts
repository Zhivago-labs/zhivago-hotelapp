// Integração contra o banco LOCAL (DATABASE_URL do .env) — casos de aceite de
// docs/mapeamento-crm-zhivago.md (Contatos, distribuição, transições, SLA, saída de integrante).
// Cria dados com um tag único, exercita rotas reais e funções do núcleo, e apaga tudo no fim.
// Rodar: npx tsx tests/crm-contacts-distribution.db.ts
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import jwt from '@fastify/jwt';
import { prisma } from '../src/lib/prisma.js';
import { organizationsRoutes } from '../src/routes/organizations.routes.js';
import { leadsRoutes } from '../src/routes/leads.routes.js';
import { chatRoutes } from '../src/routes/chat.routes.js';
import { ensureLead, ensureLeadDetailed, recordChatMessageActivity, getCurrentAssignment } from '../src/lib/leads.js';

const app = Fastify();
await app.register(jwt, { secret: process.env.JWT_SECRET ?? 'x' });
await app.register(organizationsRoutes);
await app.register(leadsRoutes);
await app.register(chatRoutes);

const tag = `crm${Date.now()}`;
const mk = (n: string, phone?: string, name?: string) =>
  prisma.user.create({ data: { name: name ?? `${n} ${tag}`, email: `${n}.${tag}@test.local`, phone: phone ?? null } });
const [owner, manager, brokerA, brokerB, assistant, otherOwner] = await Promise.all(
  ['owner', 'manager', 'brokera', 'brokerb', 'assistant', 'otherowner'].map((n) => mk(n))
);
const marina = await mk('marina', '(31) 99876-5432', `Marina ${tag}`);
const marina2 = await mk('marina2', '(11) 91111-2222', `Marina ${tag}`);
const c3 = await mk('c3'), c4 = await mk('c4'), c5 = await mk('c5'), c6 = await mk('c6'), c7 = await mk('c7');

const org = await prisma.organization.create({ data: { name: `Imob ${tag}`, document: '1' } });
const otherOrg = await prisma.organization.create({ data: { name: `Outra ${tag}`, document: '2' } });
const mem = async (user: { id: string }, role: string, organizationId = org.id, createdAt?: Date) =>
  prisma.organizationMember.create({ data: { userId: user.id, role, organizationId, ...(createdAt ? { createdAt } : {}) } });
const mOwner = await mem(owner, 'OWNER', org.id, new Date('2020-01-01'));
const mManager = await mem(manager, 'MANAGER', org.id, new Date('2020-01-02'));
const mA = await mem(brokerA, 'BROKER', org.id, new Date('2020-01-03'));
const mB = await mem(brokerB, 'BROKER', org.id, new Date('2020-01-04'));
await mem(assistant, 'ASSISTANT');
await mem(otherOwner, 'OWNER', otherOrg.id);

const building = await prisma.organizationBuilding.create({ data: { name: `Ed ${tag}`, organizationId: org.id, leadOwnerMemberId: mA.id, backupMemberId: mB.id } });
const listing = (name: string, extra: Record<string, unknown> = {}) =>
  prisma.listing.create({ data: { name: `${name} ${tag}`, price: 1, type: 'apartamento', category: 'venda', location: 'X', organizationId: org.id, status: 'APPROVED', operationType: 'SALE', ...extra } });
const L1 = await listing('Apartamento A', { agentId: brokerA.id });
const L2 = await listing('Casa B', { agentId: brokerA.id });
const L3 = await listing('Sala C', { agentId: brokerA.id });
const LB = await listing('Torre', { buildingId: building.id });
const LR = await listing('Rodizio');
const listingIds = [L1.id, L2.id, L3.id, LB.id, LR.id];

const tok = (u: { id: string }) => app.jwt.sign({ id: u.id, role: 'USER', tokenVersion: 0 });
const call = (u: { id: string }, method: string, url: string, payload?: object) =>
  app.inject({ method: method as never, url, payload, headers: { authorization: `Bearer ${tok(u)}` } });
const open = (leadId: string) => getCurrentAssignment(leadId);

try {
  // ── Contatos: 1 pessoa, 3 oportunidades (NEW, WON, LOST) ───────────────────────────────────
  const l1 = await ensureLead({ userId: marina.id, listingId: L1.id, organizationId: org.id });
  const l2 = await ensureLead({ userId: marina.id, listingId: L2.id, organizationId: org.id });
  const l3 = await ensureLead({ userId: marina.id, listingId: L3.id, organizationId: org.id, source: 'BOOKING' });
  assert.equal((await open(l1.id))?.brokerId, mA.id, 'responsável do imóvel recebe');
  assert.equal((await open(l1.id))?.source, 'LISTING_AGENT');
  assert.equal((await call(brokerA, 'PATCH', `/leads/${l2.id}/status`, { status: 'WON' })).statusCode, 200);
  assert.equal((await call(brokerA, 'PATCH', `/leads/${l3.id}/status`, { status: 'LOST' })).statusCode, 400, 'LOST sem motivo é recusado');
  assert.equal((await call(brokerA, 'PATCH', `/leads/${l3.id}/status`, { status: 'LOST', lostReason: 'UNAVAILABLE', lostNote: 'datas indisponíveis' })).statusCode, 200);

  const contactsUrl = (q: string) => `/organizations/contacts?search=${encodeURIComponent(tag)}&${q}`;
  let r = (await call(owner, 'GET', contactsUrl('view=people'))).json();
  const marinaRow = r.items.find((i: any) => i.id === marina.id);
  assert.equal(marinaRow.visibleOpportunities, 3, 'Todos: uma pessoa com três oportunidades');
  assert.equal(marinaRow.opportunities.length, 3);
  assert.equal(r.items.filter((i: any) => i.id === marina.id).length, 1, 'pessoa aparece uma vez');

  r = (await call(owner, 'GET', contactsUrl('view=people&stage=LOST'))).json();
  assert.deepEqual(r.items.map((i: any) => i.id), [marina.id], 'Perdidos seleciona a pessoa');
  assert.equal(r.items[0].opportunities.length, 1, 'expansão mostra só a oportunidade que motivou');
  assert.equal(r.items[0].visibleOpportunities, 3);
  r = (await call(owner, 'GET', contactsUrl('view=opportunities&stage=LOST'))).json();
  assert.deepEqual(r.items.map((i: any) => i.id), [l3.id], 'visão Oportunidades devolve só o lead perdido');
  assert.equal(r.items[0].lostReason, 'UNAVAILABLE');
  assert.equal(r.peopleTotal, 1); assert.equal(r.opportunityTotal, 1);
  const detail = (await call(owner, 'GET', `/organizations/contacts/${marina.id}`)).json();
  assert.equal(detail.opportunities.length, 3, 'ficha recupera as três');

  // Mesmo nome não funde; telefone com ou sem pontuação.
  await ensureLead({ userId: marina2.id, listingId: L1.id, organizationId: org.id });
  r = (await call(owner, 'GET', `/organizations/contacts?search=${encodeURIComponent('Marina ' + tag)}`)).json();
  assert.equal(r.peopleTotal, 2, 'homônimos continuam separados');
  for (const phone of ['31998765432', '99876-5432', '(31) 99876']) {
    r = (await call(owner, 'GET', `/organizations/contacts?search=${encodeURIComponent(phone)}`)).json();
    assert.ok(r.items.some((i: any) => i.id === marina.id), `busca por telefone "${phone}"`);
    assert.ok(!r.items.some((i: any) => i.id === marina2.id));
  }

  // ── Escopo: corretor vê só a carteira atual; troca reflete nas duas carteiras ────────────────
  r = (await call(brokerB, 'GET', contactsUrl('view=opportunities'))).json();
  assert.equal(r.opportunityTotal, 0, 'corretor B sem carteira');
  let res = await call(manager, 'PATCH', `/leads/${l1.id}/assign`, { brokerMemberId: mB.id });
  assert.equal(res.statusCode, 400, 'transferência exige motivo');
  res = await call(manager, 'PATCH', `/leads/${l1.id}/assign`, { brokerMemberId: mB.id, reason: 'Cobertura de férias' });
  assert.equal(res.statusCode, 201);
  r = (await call(brokerB, 'GET', contactsUrl('view=opportunities'))).json();
  assert.deepEqual(r.items.map((i: any) => i.id), [l1.id]);
  assert.equal((await call(brokerB, 'GET', `/organizations/contacts/${marina.id}`)).json().opportunities.length, 1, 'ficha do corretor limita-se ao que é dele');
  r = (await call(brokerA, 'GET', contactsUrl('view=opportunities'))).json();
  assert.ok(!r.items.some((i: any) => i.id === l1.id), 'ex-responsável perde o lead do escopo');
  assert.equal((await call(manager, 'PATCH', `/leads/${l1.id}/assign`, { brokerMemberId: mB.id, reason: 'x' })).statusCode, 200, 'mesma pessoa = idempotente');

  // ── Isolamento entre imobiliárias e assistente somente leitura ─────────────────────────────
  assert.equal((await call(otherOwner, 'GET', `/organizations/contacts/${marina.id}`)).statusCode, 404);
  assert.equal((await call(otherOwner, 'GET', contactsUrl('view=people'))).json().peopleTotal, 0);
  assert.equal((await call(otherOwner, 'GET', `/leads/${l1.id}`)).statusCode, 403);
  assert.equal((await call(otherOwner, 'PATCH', `/leads/${l1.id}/status`, { status: 'QUALIFIED' })).statusCode, 403);
  assert.equal((await call(assistant, 'GET', `/organizations/contacts/${marina.id}`)).json().canMutate, false);
  assert.equal((await call(assistant, 'GET', `/leads/${l1.id}`)).statusCode, 200);
  assert.equal((await call(assistant, 'PATCH', `/leads/${l1.id}/status`, { status: 'QUALIFIED' })).statusCode, 403);
  assert.equal((await call(assistant, 'POST', `/leads/${l1.id}/interactions`, { type: 'NOTE' })).statusCode, 403);

  // ── Chat acompanha o responsável; 1ª resposta efetiva ─────────────────────────────────────
  const conv = (await call(c3, 'POST', '/conversations', { listingId: L2.id })).json();
  const l2c3 = await prisma.lead.findUniqueOrThrow({ where: { userId_listingId: { userId: c3.id, listingId: L2.id } } });
  let parts = (await prisma.conversation.findUniqueOrThrow({ where: { id: conv.id }, include: { participants: true } })).participants.map((p) => p.id).sort();
  assert.deepEqual(parts, [brokerA.id, c3.id].sort());
  await call(brokerA, 'POST', `/leads/${l2c3.id}/interactions`, { type: 'NOTE', content: 'nota' });
  await call(brokerA, 'POST', `/leads/${l2c3.id}/interactions`, { type: 'PHONE_CALL', outcome: 'ATTEMPT' });
  await call(brokerA, 'PATCH', `/leads/${l2c3.id}/status`, { status: 'QUALIFIED' });
  assert.equal((await open(l2c3.id))?.firstContactAt, null, 'nota, tentativa e etapa não contam como resposta');
  await recordChatMessageActivity(l2c3.id, c3.id);
  assert.equal((await open(l2c3.id))?.firstContactAt, null, 'mensagem do cliente não conta');
  await recordChatMessageActivity(l2c3.id, brokerA.id);
  assert.equal((await open(l2c3.id))?.firstContactChannel, 'CHAT', 'mensagem humana da equipe conta');
  assert.equal((await call(manager, 'PATCH', `/leads/${l2c3.id}/assign`, { brokerMemberId: mB.id, reason: 'Redistribuição', moveOpenWork: true })).statusCode, 201);
  parts = (await prisma.conversation.findUniqueOrThrow({ where: { id: conv.id }, include: { participants: true } })).participants.map((p) => p.id).sort();
  assert.deepEqual(parts, [brokerB.id, c3.id].sort(), 'ex-responsável sai da conversa, novo entra');
  assert.equal((await call(brokerA, 'GET', `/conversations/${conv.id}/messages`)).statusCode, 403);

  // ── Transições: reabrir, conflito de etapa, reentrada ─────────────────────────────────────
  assert.equal((await call(brokerA, 'PATCH', `/leads/${l3.id}/status`, { status: 'CONTACTED' })).json().code, 'REOPEN_REQUIRED');
  await ensureLead({ userId: marina.id, listingId: L3.id, organizationId: org.id, source: 'CHAT' });
  assert.equal(await prisma.leadEntry.count({ where: { leadId: l3.id, kind: 'REENTRY' } }), 1, 'volta depois de perder registra reentrada');
  res = await call(brokerA, 'POST', `/leads/${l3.id}/reopen`, { note: 'cliente voltou' });
  assert.equal(res.statusCode, 200);
  const reopened = await prisma.lead.findUniqueOrThrow({ where: { id: l3.id } });
  assert.equal(reopened.status, 'CONTACTED'); assert.equal(reopened.lostReason, null); assert.ok(reopened.reopenedAt);
  assert.equal((await call(brokerA, 'PATCH', `/leads/${l3.id}/status`, { status: 'QUALIFIED', expectedStatus: 'NEW' })).statusCode, 409);

  // ── Distribuição: principal → substituto ────────────────────────────────────────────────
  const b1 = await ensureLead({ userId: c4.id, listingId: LB.id, organizationId: org.id });
  assert.equal((await open(b1.id))?.source, 'BUILDING_OWNER');
  assert.equal((await open(b1.id))?.brokerId, mA.id);
  await prisma.organizationMember.update({ where: { id: mA.id }, data: { receiveLeads: false } });
  const b2 = await ensureLead({ userId: c5.id, listingId: LB.id, organizationId: org.id });
  assert.equal((await open(b2.id))?.brokerId, mB.id, 'principal pausado → substituto');
  assert.equal((await open(b2.id))?.source, 'BACKUP');
  await prisma.organizationMember.update({ where: { id: mA.id }, data: { receiveLeads: true } });

  // ── Rodízio: duas entradas simultâneas consomem turnos distintos ───────────────────────────
  await prisma.organization.update({ where: { id: org.id }, data: { leadDistributionMode: 'ROUND_ROBIN', leadRoundRobinCursor: null } });
  await prisma.organizationMember.updateMany({ where: { id: { in: [mOwner.id, mManager.id] } }, data: { receiveLeads: false } });
  const [rr1, rr2] = await Promise.all([
    ensureLead({ userId: c6.id, listingId: LR.id, organizationId: org.id }),
    ensureLead({ userId: c7.id, listingId: LR.id, organizationId: org.id }),
  ]);
  const rrBrokers = [(await open(rr1.id))!.brokerId, (await open(rr2.id))!.brokerId].sort();
  assert.deepEqual(rrBrokers, [mA.id, mB.id].sort(), 'turnos distintos');

  // Mesma entrada concorrente → um lead e uma atribuição.
  const same = await Promise.all([1, 2, 3].map(() => ensureLeadDetailed({ userId: c4.id, listingId: LR.id, organizationId: org.id })));
  assert.equal(new Set(same.map((s) => s.lead.id)).size, 1);
  assert.equal(same.filter((s) => s.created).length, 1);
  assert.equal(await prisma.leadAssignment.count({ where: { leadId: same[0]!.lead.id, unassignedAt: null } }), 1);

  // Zero elegíveis → fila com motivo; continua em Contatos.
  await prisma.organizationMember.updateMany({ where: { id: { in: [mA.id, mB.id] } }, data: { receiveLeads: false } });
  const q1 = await ensureLead({ userId: c5.id, listingId: LR.id, organizationId: org.id });
  assert.equal(await open(q1.id), null);
  assert.equal((await prisma.lead.findUniqueOrThrow({ where: { id: q1.id } })).queueReason, 'NO_ELIGIBLE');
  const queue = (await call(manager, 'GET', '/leads/queue')).json();
  assert.ok(queue.items.some((i: any) => i.id === q1.id), 'aparece na fila');
  assert.equal((await call(brokerA, 'GET', '/leads/queue')).statusCode, 403);
  assert.ok((await call(owner, 'GET', contactsUrl('view=opportunities&unassigned=true'))).json().items.some((i: any) => i.id === q1.id));
  const assignees = (await call(manager, 'GET', '/leads/assignees')).json();
  assert.ok(assignees.every((a: any) => a.eligible === false), 'seletor e API usam a mesma elegibilidade');
  assert.equal((await call(manager, 'PATCH', `/leads/${q1.id}/assign`, { brokerMemberId: mA.id })).json().code, 'MEMBER_NOT_RECEIVING_LEADS');
  await prisma.organizationMember.updateMany({ where: { id: { in: [mA.id, mB.id, mManager.id] } }, data: { receiveLeads: true } });
  assert.equal((await call(manager, 'POST', `/leads/${q1.id}/claim`)).statusCode, 201, 'gestor elegível assume da fila');

  // Trocas concorrentes: resultado explícito e uma única atribuição aberta.
  const concurrent = await Promise.all([
    call(owner, 'PATCH', `/leads/${q1.id}/assign`, { brokerMemberId: mA.id, reason: 'r1' }),
    call(owner, 'PATCH', `/leads/${q1.id}/assign`, { brokerMemberId: mB.id, reason: 'r2' }),
  ]);
  assert.ok(concurrent.every((c) => [200, 201].includes(c.statusCode)));
  assert.equal(await prisma.leadAssignment.count({ where: { leadId: q1.id, unassignedAt: null } }), 1);
  assert.equal(await prisma.leadAssignment.count({ where: { leadId: q1.id } }), 3, 'histórico íntegro');

  // ── Registro pela equipe ──────────────────────────────────────────────────────────────────
  res = await call(brokerB, 'POST', '/leads', { listingId: L1.id, phone: '31 99876 5432', source: 'PHONE', note: 'ligou no plantão', contacted: true });
  assert.equal(res.statusCode, 200, 'cliente já tinha a oportunidade: nova entrada');
  res = await call(brokerB, 'POST', '/leads', { listingId: LR.id, email: `marina.${tag}@test.local`, source: 'REFERRAL' });
  assert.equal(res.statusCode, 201);
  assert.equal((await open(res.json().leadId))?.brokerId, mB.id, 'corretor que registra fica com a oportunidade');
  assert.equal((await call(brokerB, 'POST', '/leads', { listingId: LR.id, email: `ninguem.${tag}@test.local`, source: 'PHONE' })).statusCode, 404);

  // ── Saída de integrante: andamento redistribui ou vai à fila; encerrado preserva ────────────
  await prisma.organization.update({ where: { id: org.id }, data: { leadDistributionMode: 'MANUAL' } });
  await prisma.organizationMember.update({ where: { id: mOwner.id }, data: { receiveLeads: false } });
  const aOpen = await prisma.leadAssignment.findMany({ where: { brokerId: mA.id, unassignedAt: null }, include: { lead: true } });
  const aActive = aOpen.filter((a) => !['WON', 'LOST'].includes(a.lead.status)).map((a) => a.leadId);
  const aClosed = aOpen.filter((a) => ['WON', 'LOST'].includes(a.lead.status)).map((a) => a.leadId);
  assert.ok(aActive.length && aClosed.length, 'cenário tem leads em andamento e encerrados');
  res = await call(owner, 'DELETE', `/organizations/members/${brokerA.id}`);
  assert.equal(res.statusCode, 200);
  for (const leadId of aClosed) assert.equal((await open(leadId))?.brokerId, mA.id, 'encerrado preserva atribuição de encerramento');
  for (const leadId of aActive) {
    const cur = await open(leadId);
    assert.notEqual(cur?.brokerId, mA.id);
    assert.notEqual(cur?.brokerId, mOwner.id, 'nunca vai para o proprietário pausado');
    if (!cur) assert.equal((await prisma.lead.findUniqueOrThrow({ where: { id: leadId } })).queueReason, 'MEMBER_REMOVED');
  }
  assert.equal(await prisma.organizationAuditLog.count({ where: { organizationId: org.id, action: 'MEMBER_REMOVED' } }), 1);

  // ── Métricas com período e denominadores ──────────────────────────────────────────────────
  const metrics = (await call(manager, 'GET', '/organizations/metrics?days=30')).json();
  assert.ok(metrics.period.entries > 0);
  assert.equal(metrics.period.won, 1);
  assert.ok(metrics.period.response.due >= metrics.period.response.onTime);
  assert.ok(Array.isArray(metrics.period.bySource));
  const home = (await call(manager, 'GET', '/organizations/workspace?days=30')).json();
  assert.ok('blocks' in home && 'unassigned' in home.blocks);

  console.log('PASS: Contatos (pessoas x oportunidades, perdidos, ficha, homônimos, telefone), escopo por papel e transferência, isolamento, assistente, chat acompanha responsável, 1ª resposta efetiva, reabertura/conflito/reentrada, principal→substituto, rodízio concorrente, entrada concorrente, fila sem elegíveis, elegibilidade única, troca concorrente, registro pela equipe, saída de integrante, métricas e Início.');
} finally {
  const leads = await prisma.lead.findMany({ where: { organizationId: org.id }, select: { id: true } });
  const leadIds = leads.map((l) => l.id);
  await prisma.message.deleteMany({ where: { conversation: { propertyId: { in: listingIds } } } });
  await prisma.conversation.deleteMany({ where: { propertyId: { in: listingIds } } });
  await prisma.leadTask.deleteMany({ where: { leadId: { in: leadIds } } });
  await prisma.visit.deleteMany({ where: { leadId: { in: leadIds } } });
  await prisma.leadInteraction.deleteMany({ where: { leadId: { in: leadIds } } });
  await prisma.leadAssignment.deleteMany({ where: { leadId: { in: leadIds } } });
  await prisma.lead.deleteMany({ where: { id: { in: leadIds } } });
  await prisma.listing.deleteMany({ where: { id: { in: listingIds } } });
  await prisma.organizationAuditLog.deleteMany({ where: { organizationId: { in: [org.id, otherOrg.id] } } });
  await prisma.organizationBuilding.deleteMany({ where: { organizationId: org.id } });
  await prisma.organizationMember.deleteMany({ where: { organizationId: { in: [org.id, otherOrg.id] } } });
  await prisma.organization.deleteMany({ where: { id: { in: [org.id, otherOrg.id] } } });
  await prisma.notification.deleteMany({ where: { user: { email: { endsWith: `${tag}@test.local` } } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: `${tag}@test.local` } } });
  await app.close();
  await prisma.$disconnect();
}
