import assert from 'node:assert/strict';
import { test } from 'node:test';
import Fastify from 'fastify';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';

// Banco em memória: só o que as rotas de código/pedido usam.
type Row = Record<string, any>;
const db = {
  users: [] as Row[],
  orgs: [] as Row[],
  members: [] as Row[],
  requests: [] as Row[],
  notifications: [] as Row[],
};
function reset() {
  db.users = ['owner', 'broker', 'personal', 'other-owner', 'newbie', 'removed'].map((id) => ({ id, name: id, email: `${id}@test`, avatar: null, role: 'USER', status: 'ACTIVE', tokenVersion: 0, accountType: id.includes('owner') ? 'AGENCY' : 'INDIVIDUAL', onboardingCompleted: id !== 'newbie' }));
  db.orgs = [
    { id: 'org', name: 'Horizonte', type: 'AGENCY', joinCode: null, logo: null },
    { id: 'org2', name: 'Outra', type: 'AGENCY', joinCode: 'ZZZZ2222', logo: null },
    { id: 'pf', name: 'Pessoa física', type: 'INDIVIDUAL', joinCode: 'PFPF2222', logo: null },
  ];
  db.members = [
    { id: 'm-owner', userId: 'owner', organizationId: 'org', role: 'OWNER', status: 'ACTIVE', receiveLeads: true },
    { id: 'm-broker', userId: 'broker', organizationId: 'org', role: 'BROKER', status: 'ACTIVE', receiveLeads: true },
    { id: 'm-other', userId: 'other-owner', organizationId: 'org2', role: 'OWNER', status: 'ACTIVE', receiveLeads: true },
    { id: 'm-removed', userId: 'removed', organizationId: 'org', role: 'MANAGER', status: 'INACTIVE', receiveLeads: false },
  ];
  db.requests = [];
  db.notifications = [];
}
const match = (row: Row, where: Row = {}) => Object.entries(where).every(([k, v]) => {
  if (v && typeof v === 'object' && 'in' in v) return v.in.includes(row[k]);
  return row[k] === v;
});
const pick = (row: Row | undefined, select?: Row): Row | null => {
  if (!row) return null;
  if (!select) return { ...row };
  return Object.fromEntries(Object.entries(select).map(([k, v]) => {
    if (v === true) return [k, row[k]];
    const related = k === 'organization' ? db.orgs.find((o) => o.id === row.organizationId) : db.users.find((u) => u.id === row.userId);
    return [k, pick(related, (v as Row).select)];
  }));
};
let seq = 0;
(globalThis as unknown as { prisma: unknown }).prisma = {
  $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
  user: {
    findUnique: async ({ where, select }: Row) => pick(db.users.find((u) => u.id === where.id), select),
    update: async ({ where, data }: Row) => Object.assign(db.users.find((u) => u.id === where.id)!, data),
    updateMany: async ({ where, data }: Row) => { const rows = db.users.filter((u) => match(u, where)); rows.forEach((r) => Object.assign(r, data)); return { count: rows.length }; },
  },
  organization: {
    findUnique: async ({ where, select }: Row) => pick(db.orgs.find((o) => match(o, where)), select),
    update: async ({ where, data }: Row) => {
      if (data.joinCode && db.orgs.some((o) => o.joinCode === data.joinCode && o.id !== where.id)) throw Object.assign(new Error('unique'), { code: 'P2002' });
      return Object.assign(db.orgs.find((o) => o.id === where.id)!, data);
    },
  },
  organizationMember: {
    findUnique: async ({ where }: Row) => pick(db.members.find((m) => m.userId === where.userId)),
    findMany: async ({ where, select }: Row) => db.members.filter((m) => match(m, where)).map((m) => pick(m, select)),
    create: async ({ data }: Row) => { const row = { id: `m${++seq}`, status: 'ACTIVE', receiveLeads: true, ...data }; db.members.push(row); return row; },
    update: async ({ where, data }: Row) => Object.assign(db.members.find((m) => m.id === where.id)!, data),
  },
  organizationJoinRequest: {
    create: async ({ data, select }: Row) => { const row = { id: `r${++seq}`, status: 'PENDING', createdAt: new Date(), ...data }; db.requests.push(row); return pick(row, select); },
    findFirst: async ({ where, select }: Row) => pick([...db.requests].reverse().find((r) => match(r, where)), select),
    findMany: async ({ where, select }: Row) => db.requests.filter((r) => match(r, where)).map((r) => pick(r, select)),
    update: async ({ where, data }: Row) => Object.assign(db.requests.find((r) => r.id === where.id)!, data),
    updateMany: async ({ where, data }: Row) => { const rows = db.requests.filter((r) => match(r, where)); rows.forEach((r) => Object.assign(r, data)); return { count: rows.length }; },
  },
  notification: { create: async ({ data }: Row) => { db.notifications.push(data); return data; } },
  userDevice: { findMany: async () => [] },
};
const { organizationsRoutes } = await import('../routes/organizations.routes.js');

async function buildApp(max = 1000) {
  const app = Fastify();
  await app.register(jwt, { secret: 'join-code-test-secret' });
  await app.register(rateLimit, { max });
  await app.register(organizationsRoutes);
  await app.ready();
  const as = (id: string) => ({ authorization: `Bearer ${app.jwt.sign({ id })}` });
  return { app, as };
}

test('código de convite da imobiliária com aprovação do dono', async (t) => {
  reset();
  const { app, as } = await buildApp();
  try {
    let code = '';
    await t.test('só OWNER/ADMIN vê o código; ele é gerado uma vez e no formato XXXX-XXXX', async () => {
      assert.equal((await app.inject({ url: '/organizations/join-code', headers: as('broker') })).statusCode, 403);
      assert.equal((await app.inject({ url: '/organizations/join-code', headers: as('personal') })).statusCode, 404);
      const first = await app.inject({ url: '/organizations/join-code', headers: as('owner') });
      code = first.json().code;
      assert.match(code, /^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/);
      assert.equal((await app.inject({ url: '/organizations/join-code', headers: as('owner') })).json().code, code);
    });

    await t.test('código inválido, de pessoa física ou mal digitado não cria pedido', async () => {
      assert.equal((await app.inject({ method: 'POST', url: '/organizations/join-requests', headers: as('personal'), payload: { code: 'ABC' } })).statusCode, 400);
      assert.equal((await app.inject({ method: 'POST', url: '/organizations/join-requests', headers: as('personal'), payload: { code: 'AAAA-AAAA' } })).statusCode, 404);
      assert.equal((await app.inject({ method: 'POST', url: '/organizations/join-requests', headers: as('personal'), payload: { code: 'PFPF-2222' } })).statusCode, 404);
      assert.equal(db.requests.length, 0);
    });

    let requestId = '';
    await t.test('código certo cria um pedido pendente sem dar acesso, aceita minúsculas/sem hífen e avisa o dono', async () => {
      const response = await app.inject({ method: 'POST', url: '/organizations/join-requests', headers: as('personal'), payload: { code: code.replace('-', '').toLowerCase() } });
      assert.equal(response.statusCode, 201);
      assert.equal(response.json().organization.name, 'Horizonte');
      requestId = response.json().id;
      assert.equal(db.members.some((m) => m.userId === 'personal'), false, 'sem acesso antes da aprovação');
      assert.ok(db.notifications.some((n) => n.userId === 'owner' && n.title.includes('Pedido')));
      assert.equal(db.notifications.some((n) => n.userId === 'broker'), false, 'corretor não é avisado');
      assert.equal((await app.inject({ method: 'POST', url: '/organizations/join-requests', headers: as('personal'), payload: { code } })).statusCode, 409, 'não duplica');
      assert.equal((await app.inject({ url: '/organizations/join-requests/me', headers: as('personal') })).json().status, 'PENDING');
    });

    await t.test('quem já é membro ativo ou foi de outra imobiliária não pode pedir', async () => {
      assert.equal((await app.inject({ method: 'POST', url: '/organizations/join-requests', headers: as('other-owner'), payload: { code } })).statusCode, 409);
      assert.equal((await app.inject({ method: 'POST', url: '/organizations/join-requests', headers: as('broker'), payload: { code } })).statusCode, 409);
    });

    await t.test('corretor não aprova; dono de outra imobiliária não enxerga nem aprova o pedido', async () => {
      assert.equal((await app.inject({ method: 'POST', url: `/organizations/join-requests/${requestId}/approve`, headers: as('broker') })).statusCode, 403);
      assert.deepEqual((await app.inject({ url: '/organizations/join-requests', headers: as('other-owner') })).json(), []);
      assert.equal((await app.inject({ method: 'POST', url: `/organizations/join-requests/${requestId}/approve`, headers: as('other-owner') })).statusCode, 404);
    });

    await t.test('dono aprova: vira corretor (BROKER) e conta de imobiliária', async () => {
      const list = await app.inject({ url: '/organizations/join-requests', headers: as('owner') });
      assert.equal(list.json()[0].user.email, 'personal@test');
      assert.equal((await app.inject({ method: 'POST', url: `/organizations/join-requests/${requestId}/approve`, headers: as('owner') })).statusCode, 200);
      const member = db.members.find((m) => m.userId === 'personal');
      assert.equal(member?.role, 'BROKER');
      assert.equal(member?.organizationId, 'org');
      assert.equal(db.users.find((u) => u.id === 'personal')?.accountType, 'AGENCY');
      assert.equal((await app.inject({ method: 'POST', url: `/organizations/join-requests/${requestId}/approve`, headers: as('owner') })).statusCode, 404, 'não aprova duas vezes');
    });

    await t.test('primeiro acesso pelo código conclui o cadastro; recusa avisa a pessoa e não dá acesso', async () => {
      const response = await app.inject({ method: 'POST', url: '/organizations/join-requests', headers: as('newbie'), payload: { code } });
      assert.equal(response.statusCode, 201);
      assert.equal(db.users.find((u) => u.id === 'newbie')?.onboardingCompleted, true);
      assert.equal(db.users.find((u) => u.id === 'newbie')?.accountType, 'INDIVIDUAL');
      assert.equal((await app.inject({ method: 'POST', url: `/organizations/join-requests/${response.json().id}/reject`, headers: as('owner') })).statusCode, 200);
      assert.equal(db.members.some((m) => m.userId === 'newbie'), false);
      assert.ok(db.notifications.some((n) => n.userId === 'newbie' && n.title.includes('não aprovado')));
      assert.equal((await app.inject({ url: '/organizations/join-requests/me', headers: as('newbie') })).json().status, 'REJECTED');
    });

    await t.test('ex-membro da mesma imobiliária volta como corretor reativando o vínculo antigo', async () => {
      const response = await app.inject({ method: 'POST', url: '/organizations/join-requests', headers: as('removed'), payload: { code } });
      assert.equal(response.statusCode, 201);
      await app.inject({ method: 'POST', url: `/organizations/join-requests/${response.json().id}/approve`, headers: as('owner') });
      const rows = db.members.filter((m) => m.userId === 'removed');
      assert.equal(rows.length, 1);
      assert.deepEqual([rows[0]!.status, rows[0]!.role, rows[0]!.receiveLeads], ['ACTIVE', 'BROKER', true]);
    });

    await t.test('gerar novo código invalida o anterior; cancelar pedido funciona', async () => {
      const fresh = (await app.inject({ method: 'POST', url: '/organizations/join-code/regenerate', headers: as('owner') })).json().code;
      assert.notEqual(fresh, code);
      db.members = db.members.filter((m) => m.userId !== 'newbie');
      assert.equal((await app.inject({ method: 'POST', url: '/organizations/join-requests', headers: as('newbie'), remoteAddress: '10.0.0.2', payload: { code } })).statusCode, 404);
      assert.equal((await app.inject({ method: 'POST', url: '/organizations/join-requests', headers: as('newbie'), remoteAddress: '10.0.0.2', payload: { code: fresh } })).statusCode, 201);
      assert.equal((await app.inject({ method: 'DELETE', url: '/organizations/join-requests/me', headers: as('newbie') })).statusCode, 204);
      assert.equal((await app.inject({ method: 'DELETE', url: '/organizations/join-requests/me', headers: as('newbie') })).statusCode, 404);
    });
  } finally {
    await app.close();
  }
});

test('tentativas de código têm limite próprio por IP', async () => {
  reset();
  const { app, as } = await buildApp();
  try {
    const codes: number[] = [];
    for (let i = 0; i < 11; i++) codes.push((await app.inject({ method: 'POST', url: '/organizations/join-requests', headers: as('personal'), payload: { code: 'AAAA-AAAA' } })).statusCode);
    assert.deepEqual(codes.slice(0, 10), Array(10).fill(404));
    assert.equal(codes[10], 429);
  } finally {
    await app.close();
  }
});
