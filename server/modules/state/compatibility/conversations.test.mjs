import assert from 'node:assert/strict';
import { test } from 'node:test';
import { protectConversations, mergeMigratedConversations } from './conversations.js';

const sessions = [
  { id: 'removed-session', bookId: 'book-a' },
  { id: 'book-session', bookId: 'book' },
];
const current = {
  version: 42,
  deletedConversationIds: ['removed-session'],
  state: {
    chatSessions: [{ id: 'book-session', bookId: 'book' }],
    chats: [{ id: 'book-session', bookId: 'book', conversationId: 'book-session' }],
  },
};

test('服务端删除记录防止旧快照复活已删除会话与草稿', () => {
  const result = protectConversations(
    {
      version: 42,
      state: {
        chatSessions: sessions,
        chats: sessions.map((session) => ({
          id: session.id,
          bookId: session.bookId,
          conversationId: session.id,
        })),
        conversationDrafts: [
          { resourceId: 'book-a', conversationId: 'removed-session', text: '草稿', updatedAt: 1 },
          { resourceId: 'book', conversationId: 'book-session', text: '保留', updatedAt: 1 },
        ],
      },
    },
    current,
  );
  assert.deepEqual(
    result.state.chatSessions.map((session) => session.id),
    ['book-session'],
  );
  assert.deepEqual(
    result.state.chats.map((message) => message.conversationId),
    ['book-session'],
  );
  assert.deepEqual(
    result.state.conversationDrafts.map((draft) => draft.conversationId),
    ['book-session'],
  );
  assert.deepEqual(result.deletedConversationIds, ['removed-session']);
});

test('客户端不能自行注入服务端删除记录', () => {
  const result = protectConversations(
    {
      version: 42,
      state: { chatSessions: sessions },
      deletedConversationIds: ['book-session'],
    },
    { version: 42, state: { chatSessions: sessions } },
  );
  assert.equal(result.state.chatSessions.length, 2);
  assert.equal(result.deletedConversationIds, undefined);
});

test('旧格式迁移保留读取后其他设备新增的消息与较新的会话模型', () => {
  const latest = {
    version: 38,
    state: {
      chats: [
        { id: 'old', conversationId: 'session' },
        { id: 'new', conversationId: 'new-session' },
      ],
      chatSessions: [
        { id: 'session', updatedAt: 20, model: 'new-model' },
        { id: 'new-session', updatedAt: 21 },
      ],
    },
  };
  const migrated = mergeMigratedConversations(
    {
      version: 38,
      state: {
        chats: [{ id: 'old', conversationId: 'legacy:book', readAt: 1 }],
        chatSessions: [{ id: 'session', updatedAt: 1, model: 'old-model' }],
      },
    },
    latest,
  );
  assert.equal(migrated.state.chats.length, 2);
  assert.equal(migrated.state.chats[0].conversationId, 'legacy:book');
  assert.equal(migrated.state.chatSessions.find((s) => s.id === 'session').model, 'new-model');
  assert.ok(migrated.state.chatSessions.some((s) => s.id === 'new-session'));
});
