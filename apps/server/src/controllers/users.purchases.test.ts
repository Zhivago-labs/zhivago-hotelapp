import assert from 'node:assert/strict';
import { test } from 'node:test';
import Fastify from 'fastify';
import jwt from '@fastify/jwt';

const property = { id: 'property', name: 'Casa comprada', location: 'Campinas, SP', type: 'casa', bedrooms: 2, bathrooms: 1, parking: 1,
  minNegotiablePrice: 100, ownerId: 'seller', images: [{ url: '/cover.jpg', order: 0 }, { url: '/second.jpg', order: 1 }] };
const accepted = { buyerId: 'buyer', proposedById: 'seller', status: 'ACCEPTED', value: 450000, paymentMethod: 'À vista', createdAt: new Date('2026-11-01') };
const fixtures = [
  { id: 'purchase', customerId: 'buyer', operationType: 'SALE', status: 'AGREED', conversationId: 'chat', updatedAt: new Date('2026-11-02'), listing: property, offers: [{ ...accepted, status: 'COUNTERED', value: 500000 }, accepted] },
  { id: 'someone-else', customerId: 'other', operationType: 'SALE', status: 'AGREED', conversationId: null, updatedAt: new Date(), listing: property, offers: [{ ...accepted, buyerId: 'other' }] },
  { id: 'pending', customerId: 'buyer', operationType: 'SALE', status: 'OPEN', conversationId: 'chat', updatedAt: new Date(), listing: property, offers: [{ ...accepted, status: 'PENDING' }] },
  { id: 'rental', customerId: 'buyer', operationType: 'MONTHLY_RENT', status: 'AGREED', conversationId: 'chat', updatedAt: new Date(), listing: property, offers: [accepted] },
  { id: 'rejected', customerId: 'buyer', operationType: 'SALE', status: 'CLOSED', conversationId: 'chat', updatedAt: new Date(), listing: property, offers: [{ ...accepted, status: 'REJECTED' }] },
];
function matches(row: any, where: any): boolean {
  return Object.entries(where ?? {}).every(([key, value]: [string, any]) => value?.some
    ? row[key].some((item: any) => matches(item, value.some)) : row[key] === value);
}
function project(row: any, select: any): any {
  return Object.fromEntries(Object.entries(select).map(([key, value]: [string, any]) => {
    if (value === true) return [key, row[key]];
    if (Array.isArray(row[key])) {
      let items = row[key].filter((item: any) => matches(item, value.where));
      if (value.orderBy) { const [field, order] = Object.entries(value.orderBy)[0]!; items = [...items].sort((a: any, b: any) => (a[field] > b[field] ? 1 : -1) * (order === 'desc' ? -1 : 1)); }
      if (value.take) items = items.slice(0, value.take);
      return [key, items.map((item: any) => project(item, value.select))];
    }
    return [key, project(row[key], value.select)];
  }));
}
let fail = false;
(globalThis as unknown as { prisma: unknown }).prisma = {
  user: { findUnique: async ({ where }: any) => ({ id: where.id, email: 'test@example.com', role: 'USER', status: 'ACTIVE', tokenVersion: 0 }) },
  negotiation: { findMany: async ({ where, select }: any) => {
    if (fail) throw new Error('Database unavailable');
    return fixtures.filter((row) => matches(row, where)).sort((a, b) => +b.updatedAt - +a.updatedAt).map((row) => project(row, select));
  } },
};
const { usersRoutes } = await import('../routes/users.routes.js');

test('authenticated purchase history is private and includes only accepted sales', async (t) => {
  const app = Fastify();
  await app.register(jwt, { secret: 'purchases-test-secret' });
  await app.register(usersRoutes);
  await app.ready();
  const headers = { authorization: `Bearer ${app.jwt.sign({ id: 'buyer' })}` };
  try {
    await t.test('requires authentication', async () => {
      assert.equal((await app.inject('/users/me/purchases')).statusCode, 401);
    });
    await t.test('returns the accepted amount, cover and confirmation date without private listing fields', async () => {
      const response = await app.inject({ url: '/users/me/purchases?customerId=other', headers });
      assert.equal(response.statusCode, 200);
      assert.deepEqual(response.json(), [{ id: 'purchase', conversationId: 'chat', confirmedAt: '2026-11-02T00:00:00.000Z', value: 450000, paymentMethod: 'À vista', listing: { id: 'property', name: 'Casa comprada', location: 'Campinas, SP', type: 'casa', bedrooms: 2, bathrooms: 1, parking: 1, image: '/cover.jpg' } }]);
    });
    await t.test('a seller or an account with no purchases does not see someone else’s purchases', async () => {
      for (const id of ['seller', 'empty']) {
        const response = await app.inject({ url: '/users/me/purchases', headers: { authorization: `Bearer ${app.jwt.sign({ id })}` } });
        assert.deepEqual(response.json(), []);
      }
    });
    await t.test('database errors are distinct from an empty purchase history', async () => {
      fail = true;
      assert.equal((await app.inject({ url: '/users/me/purchases', headers })).statusCode, 500);
    });
  } finally { await app.close(); }
});
