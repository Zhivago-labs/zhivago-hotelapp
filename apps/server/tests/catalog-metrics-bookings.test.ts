import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import Fastify from 'fastify';
import jwt from '@fastify/jwt';

// Real HTTP handlers and authorization, isolated in-memory persistence for these fixtures.
const persistence: Record<string, unknown> = {};
Object.assign(globalThis, { prisma: persistence });
const { listingsRoutes } = await import('../src/routes/listings.routes.js');
const { organizationsRoutes } = await import('../src/routes/organizations.routes.js');
const { bookingsRoutes } = await import('../src/routes/bookings.routes.js');
const { usersRoutes } = await import('../src/routes/users.routes.js');
const app = Fastify();
await app.register(jwt, { secret: 'local-fixtures-only' });
await app.register(listingsRoutes);
await app.register(organizationsRoutes);
await app.register(usersRoutes);
await app.register(bookingsRoutes);
after(() => app.close());
const headersFor = (id: string) => ({ authorization: 'Bearer ' + app.jwt.sign({ id }) });
const user = { findUnique: async ({ where }: { where: { id: string } }) => ({ id: where.id, role: 'USER', status: 'ACTIVE' }) };

test('public collections summarize current and legacy listings, while the listing detail retains its address', async () => {
  const listing = { id: 'home', status: 'APPROVED', operationType: 'SALE', ownerId: 'owner', price: 100,
    location: 'Rua das Flores, 42', logradouro: 'Rua das Flores', numero: '42', cep: '00000-100', complemento: 'Apto 9',
    bairro: 'Centro', cidade: 'Timóteo', uf: 'MG' };
  const legacy = { ...listing, id: 'legacy', cidade: null, bairro: null, uf: null };
  Object.assign(persistence, { user, listing: {
    findMany: async () => [listing, legacy], findUnique: async () => listing, update: async () => listing,
  }, organizationMember: { findFirst: async () => null }, review: { findMany: async () => [] } });
  for (const headers of [{}, headersFor('guest')]) {
    for (const url of ['/listings', '/listings/home/similar', '/users/owner']) {
      const res = await app.inject({ url, headers });
      assert.equal(res.statusCode, 200);
      const [current, old] = res.json().listings ?? res.json();
      assert.equal(current.location, 'Centro, Timóteo - MG');
      assert.equal(old.location, 'Região não informada');
      for (const item of [current, old]) {
        for (const key of ['cep', 'logradouro', 'numero', 'complemento']) assert.equal(item[key], null);
      }
    }
    const detail = await app.inject({ url: '/listings/home', headers });
    assert.equal(detail.json().location, listing.location);
    assert.equal(detail.json().numero, '42');
  }
});

test('organization metrics separate active members and attributed alumni across two agencies', async () => {
  const member = (id: string, organizationId: string, status = 'ACTIVE') => ({
    id, userId: id, organizationId, status, role: 'OWNER', user: { name: id },
  });
  const members = [member('rosa', 'a'), member('former', 'a', 'INACTIVE'), member('no-history', 'a', 'INACTIVE'), member('other', 'b')];
  const at = new Date('2026-10-01T10:00Z');
  Object.assign(persistence, { user, organizationMember: {
    findUnique: async ({ where }: any) => members.find(m => m.id === where.userId),
    findMany: async ({ where }: any) => members.filter(m => m.organizationId === where.organizationId && where.role.in.includes(m.role)),
  }, lead: { groupBy: async () => [], findMany: async () => [] }, leadAssignment: {
    findMany: async ({ where }: any) => {
      assert.equal(where.lead.organizationId, where.broker.organizationId);
      return where.lead.organizationId === 'a' ? [
        { brokerId: 'former', assignedAt: at, firstContactAt: new Date(+at + 3600000), unassignedAt: at, lead: { status: 'WON' } },
        { brokerId: 'rosa', assignedAt: at, firstContactAt: null, unassignedAt: null, lead: { status: 'WON' } },
      ] : [];
    },
  } });
  const metrics = async (id: string) => app.inject({ url: '/organizations/metrics', headers: headersFor(id) });
  const a = (await metrics('rosa')).json();
  assert.deepEqual(a.byBroker.map((b: any) => [b.name, b.assignedCount, b.wonCount]), [['rosa', 1, 1]]);
  assert.deepEqual(a.formerBrokers, [{ memberId: 'former', name: 'former', assignmentCount: 1, avgResponseHours: 1 }]);
  const b = (await metrics('other')).json();
  assert.deepEqual(b.byBroker.map((row: any) => row.name), ['other']);
  assert.deepEqual(b.formerBrokers, []);
  assert.equal((await metrics('former')).statusCode, 404);
});

test('booking request, calendar and confirmation agree on nights, price and adjacent stays', async () => {
  const day = (d: number) => new Date(Date.UTC(2099, 10, d));
  const listing = { id: 'house', operationType: 'DAILY_RENT', minimumNights: 2, price: 200, cleaningFee: 80, ownerId: 'host' };
  const rows = [{ id: 'existing', userId: 'guest-a', listingId: 'house', status: 'CONFIRMED', startDate: day(19), endDate: day(21) }];
  function overlaps(where: any) {
    assert(where.startDate.lt instanceof Date && where.endDate.gt instanceof Date);
    return rows.filter(row => row.status === 'CONFIRMED' && row.startDate < where.startDate.lt && row.endDate > where.endDate.gt);
  }
  const booking = {
    findMany: async ({ where }: any) => where.startDate ? overlaps(where) : rows.filter(row => row.status === 'CONFIRMED'),
    count: async ({ where }: any) => overlaps(where).length,
    create: async ({ data }: any) => {
      const row = { ...data, id: String(rows.length), status: 'PENDING' };
      rows.push(row); return row;
    },
    findUnique: async ({ where }: any) => ({ ...rows.find(row => row.id === where.id), listing }),
    findUniqueOrThrow: async ({ where }: any) => rows.find(row => row.id === where.id)!,
    updateMany: async ({ where, data }: any) => {
      const matches = rows.filter(row => row.id === where.id && row.status === where.status);
      matches.forEach(row => Object.assign(row, data));
      return { count: matches.length };
    },
  };
  const chat = { id: 'chat', participants: [{ id: 'guest' }, { id: 'host' }] };
  Object.assign(persistence, { user, booking, listing: { findUnique: async () => listing },
    chatBlock: { findMany: async () => [] }, notification: { create: async () => ({}) }, userDevice: { findMany: async () => [] },
    negotiation: { findMany: async () => [] }, message: { create: async () => ({}), updateMany: async () => ({}), findMany: async () => [] },
    conversation: { findFirst: async () => chat, findUnique: async () => chat, update: async () => chat },
    $transaction: async (task: (tx: { booking: typeof booking }) => unknown) => task({ booking }),
  });
  const request = (start: number, end: number, estimatedTotal?: number) => app.inject({
    method: 'POST', url: '/listings/house/bookings', headers: headersFor('guest'),
    payload: { startDate: day(start).toISOString(), endDate: day(end).toISOString(), estimatedTotal },
  });
  assert.equal((await request(21, 21)).statusCode, 400);
  assert.equal((await request(21, 22)).statusCode, 400);
  assert.equal((await request(20, 22)).statusCode, 400);
  assert.equal((await request(21, 23, 400)).statusCode, 409);
  assert.equal(rows.length, 1);
  const pending = await request(21, 23, 480);
  assert.equal(pending.statusCode, 201);
  assert.equal(pending.json().conversationId, chat.id);
  assert.deepEqual([pending.json().booking.status, pending.json().booking.nights, pending.json().booking.price], ['PENDING', 2, 480]);
  const competing = await request(22, 24);
  const approve = (id: string) => app.inject({ method: 'PATCH', url: '/bookings/' + id + '/approve', headers: headersFor('host') });
  assert.equal((await approve(pending.json().booking.id)).statusCode, 200);
  assert.equal((await approve(competing.json().booking.id)).statusCode, 400);
  assert.equal((await app.inject({ url: '/listings/house/bookings' })).json().length, 2);
  listing.minimumNights = 1;
  assert.equal((await request(23, 24, 280)).statusCode, 201);
});
