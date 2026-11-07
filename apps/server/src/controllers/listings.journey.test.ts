import assert from 'node:assert/strict';
import { test, mock } from 'node:test';
import type { FastifyReply, FastifyRequest } from 'fastify';

// Install a plain in-memory client before loading controllers. No Prisma connection is opened.
const prisma = {
  listing: { findMany: async (_args: any): Promise<any> => [], findUnique: async (_args: any): Promise<any> => null, create: async (_args: any): Promise<any> => null, update: async (_args: any): Promise<any> => null },
  listingImage: { count: async (_args: any): Promise<number> => 0 },
  organizationMember: { findUnique: async (_args: any): Promise<any> => null },
};
(globalThis as unknown as { prisma: unknown }).prisma = prisma;
const { getListings, getListingById, getSimilarListings, updateListing, createListing } = await import('./listings.controller.js');

function response() {
  const result = { code: 200, body: undefined as unknown, status(code: number) { this.code = code; return this; }, send(body: unknown) { this.body = body; return this; } };
  return { result, reply: result as unknown as FastifyReply };
}
const request = (data: object) => data as FastifyRequest;

test('public catalog and recommendations request only approved, non-demo records', async () => {
  const calls: any[] = [];
  const many = mock.method(prisma.listing, 'findMany', async (args: any) => { calls.push(args); return []; });
  const one = mock.method(prisma.listing, 'findUnique', async () => ({ id: 'source', status: 'APPROVED', isDemo: false, operationType: 'SALE' }));
  try {
    await getListings(request({}), response().reply);
    await getSimilarListings(request({ params: { id: 'source' } }), response().reply);
    for (const call of calls) { assert.equal(call.where.isDemo, false); assert.equal(call.where.status, 'APPROVED'); }
    assert.equal(calls.length, 2);
  } finally { many.mock.restore(); one.mock.restore(); }
});

test('a demo cannot be opened anonymously by a direct link', async () => {
  const one = mock.method(prisma.listing, 'findUnique', async () => ({ id: 'demo', status: 'APPROVED', isDemo: true, ownerId: 'owner', organizationId: null }));
  const { result, reply } = response();
  try {
    await getListingById(request({ params: { id: 'demo' }, jwtVerify: async () => { throw new Error('anonymous'); } }), reply);
    assert.equal(result.code, 404);
  } finally { one.mock.restore(); }
});

test('publishing an incomplete saved draft is rejected before any database write', async () => {
  const one = mock.method(prisma.listing, 'findUnique', async () => ({ id: 'draft', name: '', price: 0, location: '', type: 'casa', category: 'venda', operationType: 'SALE', status: 'DRAFT', ownerId: 'owner', organizationId: null }));
  const count = mock.method(prisma.listingImage, 'count', async () => 0);
  const write = mock.method(prisma.listing, 'update', async () => { throw new Error('Must not write'); });
  const { result, reply } = response();
  try {
    await updateListing(request({ params: { id: 'draft' }, user: { id: 'owner' }, body: { status: 'PENDING' } }), reply);
    assert.equal(result.code, 400); assert.equal(write.mock.callCount(), 0);
    assert.match(JSON.stringify(result.body), /título/);
  } finally { one.mock.restore(); count.mock.restore(); write.mock.restore(); }
});

test('creating a partial draft permits missing title, location, price and photos', async () => {
  const membership = mock.method(prisma.organizationMember, 'findUnique', async () => null);
  let stored: any;
  const write = mock.method(prisma.listing, 'create', async (args: any) => { stored = args.data; return { id: 'draft', ...stored }; });
  const { result, reply } = response();
  try {
    const fields = { status: 'DRAFT', type: 'casa', category: 'venda', operationType: 'SALE', bedrooms: '0', bathrooms: '0', parking: '0' };
    const parts = async function* () { for (const [fieldname, value] of Object.entries(fields)) yield { type: 'field', fieldname, value }; };
    await createListing(request({ user: { id: 'owner', role: 'USER' }, parts }), reply);
    assert.equal(result.code, 201); assert.equal(stored.status, 'DRAFT'); assert.equal(stored.name, ''); assert.equal(stored.price, 0);
    assert.deepEqual(stored.images.create, []);
    assert.equal(stored.ownerId, 'owner'); assert.equal(stored.organizationId, null);
  } finally { membership.mock.restore(); write.mock.restore(); }
});
