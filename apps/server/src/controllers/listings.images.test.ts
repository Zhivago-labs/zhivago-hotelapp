import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FastifyReply, FastifyRequest } from 'fastify';

// Prisma em memória, instalado antes de carregar o controller (nenhuma conexão real é aberta).
const ops: string[] = [];
let listingRow: any = null;
const prisma = {
  listing: { findUnique: async (_args: any): Promise<any> => listingRow },
  listingImage: {
    deleteMany: (args: any) => { ops.push(`delete notIn=${args.where.id.notIn.join(',')}`); return args; },
    update: (args: any) => { ops.push(`update ${args.where.id}->${args.data.order}`); return args; },
    create: (args: any) => { ops.push(`create ${args.data.url}->${args.data.order}`); return args; },
    findMany: async (_args: any): Promise<any> => [],
  },
  organizationMember: { findUnique: async (_args: any): Promise<any> => null },
  $transaction: async (list: unknown[]) => { ops.push(`tx(${list.length})`); return list; },
};
(globalThis as unknown as { prisma: unknown }).prisma = prisma;
const { updateListingImages } = await import('./listings.controller.js');

function response() {
  const result = { code: 200, body: undefined as unknown, status(code: number) { this.code = code; return this; }, send(body: unknown) { this.body = body; return this; } };
  return { result, reply: result as unknown as FastifyReply };
}
const call = (order: unknown, userId = 'owner') => {
  const parts = async function* () { yield { type: 'field', fieldname: 'order', value: JSON.stringify(order) }; };
  return { params: { id: 'L1' }, user: { id: userId }, parts } as unknown as FastifyRequest;
};
const withListing = (status = 'APPROVED') => {
  ops.length = 0;
  listingRow = { id: 'L1', status, ownerId: 'owner', organizationId: null, agentId: null, images: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] };
};

test('reordena e remove fotos existentes numa única transação', async () => {
  withListing();
  const { result, reply } = response();
  await updateListingImages(call(['existing:c', 'existing:a']), reply);
  assert.equal(result.code, 200);
  assert.deepEqual(ops, ['delete notIn=c,a', 'update c->0', 'update a->1', 'tx(3)']);
});

test('recusa foto que não pertence ao anúncio, sem gravar nada', async () => {
  withListing();
  const { result, reply } = response();
  await updateListingImages(call(['existing:a', 'existing:zzz']), reply);
  assert.equal(result.code, 400);
  assert.equal(ops.includes('tx(3)') || ops.some((op) => op.startsWith('tx')), false);
});

test('recusa referência a arquivo novo que não foi enviado', async () => {
  withListing();
  const { result, reply } = response();
  await updateListingImages(call(['existing:a', 'new:0']), reply);
  assert.equal(result.code, 400);
  assert.equal(ops.length, 0);
});

test('anúncio publicado não pode ficar sem fotos; rascunho pode', async () => {
  withListing('APPROVED');
  const published = response();
  await updateListingImages(call([]), published.reply);
  assert.equal(published.result.code, 400);
  assert.match(JSON.stringify(published.result.body), /ao menos uma foto/);

  withListing('DRAFT');
  const draft = response();
  await updateListingImages(call([]), draft.reply);
  assert.equal(draft.result.code, 200);
  assert.deepEqual(ops, ['delete notIn=', 'tx(1)']);
});

test('quem não é dono nem gestor recebe 403', async () => {
  withListing();
  const { result, reply } = response();
  await updateListingImages(call(['existing:a'], 'intruso'), reply);
  assert.equal(result.code, 403);
  assert.equal(ops.length, 0);
});

test('ordem inválida ou repetida é recusada', async () => {
  withListing();
  for (const order of ['texto', ['existing:a', 'existing:a'], [1, 2]]) {
    const { result, reply } = response();
    await updateListingImages(call(order), reply);
    assert.equal(result.code, 400);
  }
  assert.equal(ops.length, 0);
});
