import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FastifyReply, FastifyRequest } from 'fastify';

// Prisma em memória, instalado antes de carregar o controller (nenhuma conexão real é aberta).
let stored: any = null;
const prisma = {
  listing: {
    findUnique: async (_args: any): Promise<any> => ({ id: 'L1', status: 'DRAFT', ownerId: 'owner', organizationId: null, operationType: 'SALE', category: 'venda', billingCycle: null }),
    update: async (args: any): Promise<any> => { stored = args.data; return { id: 'L1', ...args.data }; },
  },
  listingImage: { count: async (_args: any): Promise<number> => 1 },
  organizationMember: { findUnique: async (_args: any): Promise<any> => null },
};
(globalThis as unknown as { prisma: unknown }).prisma = prisma;
const { normalizeFeatures, updateListing } = await import('./listings.controller.js');

function response() {
  const result = { code: 200, body: undefined as unknown, status(code: number) { this.code = code; return this; }, send(body: unknown) { this.body = body; return this; } };
  return { result, reply: result as unknown as FastifyReply };
}

test('diferenciais: limpa espaços, remove vazios e repetidos, corta em 40 caracteres e 15 itens', () => {
  assert.equal(normalizeFeatures(JSON.stringify(['  Vista   para o mar ', '', 'vista para o mar', 'Varanda gourmet'])), JSON.stringify(['Vista para o mar', 'Varanda gourmet']));
  assert.equal(JSON.parse(normalizeFeatures(JSON.stringify(['x'.repeat(60)]))!)[0].length, 40);
  assert.equal(JSON.parse(normalizeFeatures(JSON.stringify(Array.from({ length: 30 }, (_, i) => `Item ${i}`)))!).length, 15);
  assert.equal(normalizeFeatures('não é json'), null);
  assert.equal(normalizeFeatures(JSON.stringify([])), null);
  assert.equal(normalizeFeatures(JSON.stringify([1, null, '  '])), null);
});

test('edição grava diferenciais normalizados e o texto da região sem espaços sobrando', async () => {
  const { result, reply } = response();
  await updateListing({ params: { id: 'L1' }, user: { id: 'owner' }, body: { features: JSON.stringify([' Piscina aquecida ', 'piscina aquecida']), neighborhood: '  Perto do metrô.  ' } } as unknown as FastifyRequest, reply);
  assert.equal(result.code, 200);
  assert.equal(stored.features, JSON.stringify(['Piscina aquecida']));
  assert.equal(stored.neighborhood, 'Perto do metrô.');
});

test('edição limpa os campos quando chegam vazios', async () => {
  const { reply } = response();
  await updateListing({ params: { id: 'L1' }, user: { id: 'owner' }, body: { features: '[]', neighborhood: '   ' } } as unknown as FastifyRequest, reply);
  assert.equal(stored.features, null);
  assert.equal(stored.neighborhood, null);
});

test('texto da região acima do limite é recusado', async () => {
  const { result, reply } = response();
  await updateListing({ params: { id: 'L1' }, user: { id: 'owner' }, body: { neighborhood: 'a'.repeat(1501) } } as unknown as FastifyRequest, reply);
  assert.equal(result.code, 400);
});
