import assert from 'node:assert/strict';
import test from 'node:test';
import { protectChatReadState } from './chatReadState.js';

test('旧客户端与旧快照不会清除已读标记，删除消息仍然有效', () => {
  const message = { id: 'reply', role: 'assistant', content: '回复' };
  const current = { version: 33, state: { chats: [{ ...message, readAt: 20 }] } };
  const incoming = { version: 32, state: { chats: [message, { id: 'new' }] } };
  assert.deepEqual(protectChatReadState(incoming, current).state.chats, [
    { ...message, readAt: 20 },
    { id: 'new' },
  ]);
  assert.equal(incoming.state.chats[0].readAt, undefined);
  assert.equal(
    protectChatReadState({ state: { chats: [{ ...message, readAt: 30 }] } }, current).state.chats[0]
      .readAt,
    30,
  );
  assert.deepEqual(protectChatReadState({ state: { chats: [] } }, current).state.chats, []);
});
