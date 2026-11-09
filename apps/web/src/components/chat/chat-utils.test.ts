import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mergeMessages, replaceServerMessages, type LocalChatMessage } from './chat-utils';

const message: LocalChatMessage = {
  id: 'message', conversationId: 'chat', senderId: 'sender', content: 'Olá',
  type: 'TEXT', metadata: null, isRead: false, createdAt: '2026-11-09T12:00:00Z',
  sender: { id: 'sender', name: 'Ana', avatar: null },
};

test('a delayed message acknowledgement cannot undo a read receipt', () => {
  assert.equal(mergeMessages([{ ...message, isRead: true }], [message])[0]?.isRead, true);
});

test('a stale reconnect snapshot cannot undo a read receipt', () => {
  assert.equal(replaceServerMessages([{ ...message, isRead: true }], [message])[0]?.isRead, true);
});

test('resync preserves pending outgoing messages without marking them read', () => {
  const pending: LocalChatMessage = { ...message, id: 'local', senderId: 'other', localStatus: 'sending', clientId: 'local' };
  const result = replaceServerMessages([pending], [{ ...message, isRead: true }]);
  assert.equal(result.length, 2);
  assert.equal(result.find((m) => m.id === 'local')?.localStatus, 'sending');
  assert.equal(result.find((m) => m.id === 'local')?.isRead, false);
});
