import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import Fastify from 'fastify';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';

const persistence: Record<string, unknown> = {};
Object.assign(globalThis, { prisma: persistence });
const { chatRoutes } = await import('../src/routes/chat.routes.js');
const { organizationsRoutes } = await import('../src/routes/organizations.routes.js');
const { listingsRoutes } = await import('../src/routes/listings.routes.js');
const app = Fastify();
await app.register(jwt, { secret: 'isolated-inbox-fixture' });
await app.register(multipart);
await app.register(chatRoutes);
await app.register(organizationsRoutes);
await app.register(listingsRoutes);
after(() => app.close());
const headers = { authorization: 'Bearer ' + app.jwt.sign({ id: 'viewer' }) };
const member = { id: 'member', userId: 'viewer', role: 'BROKER', status: 'ACTIVE', organizationId: 'agency' };
persistence.user = { findUnique: async () => ({ id: 'viewer', role: 'USER', status: 'ACTIVE', accountType: 'AGENCY' }) };
persistence.organizationMember = { findUnique: async () => member };

test('the agency inbox and the global classifier use the same membership, assignment and customer constraints', async () => {
  const conversation = (id: string, customer: string, agency: string | null) => ({
    id, property: { organizationId: agency, images: [] }, lead: { userId: customer },
    participants: [{ id: 'viewer' }], _count: { messages: 1 },
  });
  const items = [conversation('work', 'client', 'agency'), conversation('buying', 'viewer', 'agency'),
    conversation('travel', 'viewer', 'other-agency'), conversation('unassigned-history', 'other-client', 'agency')];
  persistence.conversation = { findMany: async ({ where, select }: any) => {
    assert.equal(where.participants.some.id, member.userId);
    if (!where.lead) return items;
    assert.deepEqual(where.lead, { organizationId: member.organizationId, userId: { not: member.userId }, assignments: { some: { brokerId: member.id, unassignedAt: null } } });
    assert.equal(where.property.organizationId, member.organizationId);
    return select.property ? [items[0]] : [{ id: 'work' }];
  } };
  const all = await app.inject({ url: '/conversations', headers });
  assert.equal(all.statusCode, 200);
  assert.deepEqual(all.json().map((c: any) => [c.id, c.inboxScope]), [
    ['work', 'organization'], ['buying', 'personal'], ['travel', 'personal'], ['unassigned-history', 'other'],
  ]);
  const work = await app.inject({ url: '/organizations/messages', headers });
  assert.equal(work.statusCode, 200);
  assert.deepEqual(work.json().map((c: any) => c.id), ['work']);
});

test('CSV keeps valid suites, reports inconsistent rows, and accepts files without a suites column', async () => {
  persistence.listing = { create: async ({ data }: any) => data };
  persistence.$transaction = (operations: Promise<unknown>[]) => Promise.all(operations);
  async function upload(csv: string) {
    const boundary = 'catalog-fixture';
    return app.inject({ method: 'POST', url: '/listings/import', headers: { ...headers, 'content-type': 'multipart/form-data; boundary=' + boundary },
      payload: '--' + boundary + '\r\nContent-Disposition: form-data; name="file"; filename="casas.csv"\r\nContent-Type: text/csv\r\n\r\n' + csv + '\r\n--' + boundary + '--\r\n' });
  }
  const header = 'nome,preco,tipo,categoria,localizacao,quartos,banheiros,imagens';
  const row = 'Casa,300000,casa,venda,Centro,2,1,https://example.test/casa.jpg';
  const withSuites = await upload(header + ',suítes\n' + row + ',1\n' + row + ',2');
  assert.equal(withSuites.statusCode, 200);
  assert.equal(withSuites.json().listings[0].suites, 1);
  assert.equal(withSuites.json().createdCount, 1);
  assert.equal(withSuites.json().errors[0].row, 3);
  assert.match(withSuites.json().errors[0].messages[0], /suítes/);
  const legacy = await upload(header + '\n' + row);
  assert.equal(legacy.json().listings[0].suites, 0);
});
