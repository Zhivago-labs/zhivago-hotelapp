import assert from 'node:assert/strict';
import { test } from 'node:test';
import Fastify from 'fastify';
import type { Server } from 'socket.io';

const rows = [
  { id: 'visible', conversationId: 'chat', senderId: 'sender', isRead: false },
  { id: 'offscreen', conversationId: 'chat', senderId: 'sender', isRead: false },
  { id: 'own', conversationId: 'chat', senderId: 'reader', isRead: false },
  { id: 'foreign', conversationId: 'other-chat', senderId: 'sender', isRead: false },
];
const emissions: Array<{ room: string; event: string; data: any }> = [];
const matches = (row: typeof rows[number], where: any) => row.conversationId === where.conversationId
  && row.senderId !== where.senderId.not && (!where.id || where.id.in.includes(row.id))
  && (where.isRead === undefined || row.isRead === where.isRead);
const prisma = {
  conversation: { findUnique: async () => ({ participants: [{ id: 'reader' }, { id: 'sender' }] }) },
  message: {
    findMany: async ({ where }: any) => rows.filter((row) => matches(row, where)).map(({ id }) => ({ id })),
    updateMany: async ({ where }: any) => { rows.filter((row) => matches(row, where)).forEach((row) => { row.isRead = true; }); },
  },
};
(globalThis as unknown as { prisma: unknown }).prisma = prisma;
const { markAsRead } = await import('./chat.controller.js');
const { setupSocket } = await import('../socket.js');
setupSocket({
  use() {}, on() {},
  to(room: string) { return { emit(event: string, data: any) {
    assert.ok(data.messageIds.every((id: string) => rows.find((row) => row.id === id)?.isRead));
    emissions.push({ room, event, data });
  } }; },
} as unknown as Server);

test('chat read transport, authorization and exact persisted receipts', async (t) => {
  const app = Fastify();
  app.patch('/conversations/:id/read', { preHandler: async (req) => {
    req.user = { id: req.headers['x-user'] ?? 'reader' } as typeof req.user;
  } }, markAsRead);
  try {
    await t.test('reproduces 415 for an untyped chunked PATCH', async () => {
      const response = await app.inject({ method: 'PATCH', url: '/conversations/chat/read', headers: { 'transfer-encoding': 'chunked' } });
      assert.equal(response.statusCode, 415);
      assert.equal(response.json().error, 'Unsupported Media Type');
    });
    await t.test('JSON PATCH marks only the displayed incoming messages and emits to both participants', async () => {
      const response = await app.inject({ method: 'PATCH', url: '/conversations/chat/read', headers: { 'content-type': 'application/json', 'transfer-encoding': 'chunked' }, payload: JSON.stringify({ messageIds: ['visible', 'own', 'foreign'] }) });
      assert.equal(response.statusCode, 200);
      assert.deepEqual(rows.map((row) => row.isRead), [true, false, false, false]);
      assert.deepEqual(emissions, ['reader', 'sender'].map((id) => ({ room: `room_${id}`, event: 'messagesRead', data: { conversationId: 'chat', readerId: 'reader', messageIds: ['visible'] } })));
    });
    await t.test('repeated receipts are idempotent', async () => {
      const response = await app.inject({ method: 'PATCH', url: '/conversations/chat/read', payload: { messageIds: ['visible'] } });
      assert.equal(response.statusCode, 200);
      assert.equal(emissions.length, 2);
    });
    await t.test('outsiders cannot mark or broadcast read receipts', async () => {
      const response = await app.inject({ method: 'PATCH', url: '/conversations/chat/read', headers: { 'x-user': 'outsider' }, payload: { messageIds: ['offscreen'] } });
      assert.equal(response.statusCode, 403);
      assert.equal(emissions.length, 2);
    });
    await t.test('rejects malformed receipts and oversized batches', async () => {
      for (const messageIds of ['invalid', Array(101).fill('visible')]) {
        const response = await app.inject({ method: 'PATCH', url: '/conversations/chat/read', payload: { messageIds } });
        assert.equal(response.statusCode, 400);
      }
    });
    await t.test('legacy clients sending an empty JSON object still work', async () => {
      const response = await app.inject({ method: 'PATCH', url: '/conversations/chat/read', payload: {} });
      assert.equal(response.statusCode, 200);
      assert.equal(rows[1]!.isRead, true);
      assert.equal(rows[2]!.isRead, false);
      assert.equal(rows[3]!.isRead, false);
    });
  } finally { await app.close(); }
});
