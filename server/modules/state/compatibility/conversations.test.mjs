import assert from 'node:assert/strict';
import { test } from 'node:test';
import { protectConversations } from './conversations.js';

const sessions = [
  { id: 'video-session', bookId: 'video:video' },
  { id: 'rss-session', bookId: 'rss:item' },
  { id: 'book-session', bookId: 'book' },
];
const current = {
  version: 38,
  state: {
    videoResources: [{ id: 'video' }],
    rssFeeds: [{ id: 'feed' }],
    rssItems: [{ id: 'item', feedId: 'feed' }],
    chatSessions: sessions,
    chats: sessions.map((session) => ({
      id: session.id,
      bookId: session.bookId,
      conversationId: session.id,
    })),
  },
};

test('删除视频或订阅源时清理未加载的会话，并保留其他资源', () => {
  const result = protectConversations(
    {
      ...structuredClone(current),
      state: { ...structuredClone(current.state), videoResources: [], rssFeeds: [] },
    },
    current,
  );
  assert.deepEqual(
    result.state.chatSessions.map((session) => session.id),
    ['book-session'],
  );
  assert.deepEqual(
    result.state.chats.map((message) => message.bookId),
    ['book'],
  );
  assert.deepEqual(
    new Set(result.deletedConversationIds),
    new Set(['video-session', 'rss-session']),
  );
  const old = protectConversations(structuredClone(current), result);
  assert.deepEqual(
    old.state.chatSessions.map((session) => session.id),
    ['book-session'],
  );
});

test('旧客户端缺少资源分区时不推断删除，也不能自行注入删除记录', () => {
  const result = protectConversations(
    {
      version: 17,
      state: { videoResources: [], chatSessions: sessions },
      deletedConversationIds: ['book-session'],
    },
    current,
  );
  assert.equal(result.state.chatSessions.length, 3);
  assert.equal(result.deletedConversationIds, undefined);
});

test('旧格式迁移保留读取后其他设备新增的消息与较新的会话模型', async () => {
  const { mergeMigratedConversations } = await import('./conversations.js');
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
