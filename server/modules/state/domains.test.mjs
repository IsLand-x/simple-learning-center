import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createStateDomainSnapshot,
  mergeStateDomainSnapshot,
  serializeStateDomainSnapshot,
} from './domains.js';

test('状态分区只读写自己的字段', () => {
  const current = {
    state: {
      books: [{ id: 'book-1' }],
      highlights: [{ id: 'highlight-1' }],
      chats: [{ id: 'chat-1' }],
      rssItems: [{ id: 'rss-1' }],
      themeMode: 'light',
    },
    version: 28,
  };

  assert.deepEqual(createStateDomainSnapshot(current, 'highlights'), {
    state: { highlights: [{ id: 'highlight-1' }] },
    version: 28,
  });

  const merged = mergeStateDomainSnapshot(
    current,
    {
      state: { highlights: [{ id: 'highlight-2' }], books: [] },
      version: 28,
    },
    'highlights',
  );
  assert.deepEqual(merged.state.highlights, [{ id: 'highlight-2' }]);
  assert.deepEqual(merged.state.books, [{ id: 'book-1' }]);
  assert.deepEqual(merged.state.rssItems, [{ id: 'rss-1' }]);
});

test('状态分区 ETag 只随该分区内容变化', () => {
  const first = {
    state: { books: [], rssItems: [{ id: 'rss-1' }], themeMode: 'light' },
    version: 28,
  };
  const unrelatedChange = {
    state: { books: [], rssItems: [{ id: 'rss-2' }], themeMode: 'light' },
    version: 28,
  };
  const relatedChange = {
    state: { books: [{ id: 'book-1' }], rssItems: [{ id: 'rss-2' }], themeMode: 'light' },
    version: 28,
  };

  assert.equal(
    serializeStateDomainSnapshot(first, 'library').etag,
    serializeStateDomainSnapshot(unrelatedChange, 'library').etag,
  );
  assert.notEqual(
    serializeStateDomainSnapshot(first, 'library').etag,
    serializeStateDomainSnapshot(relatedChange, 'library').etag,
  );
});

test('阅读记录与高亮接口不能读写笔记，笔记接口也不能覆盖高亮', () => {
  const current = {
    version: 35,
    state: {
      notes: [{ id: 'note', content: 'AI 正文' }],
      highlights: [{ id: 'highlight' }],
      readingSessions: [{ id: 'session' }],
    },
  };
  assert.deepEqual(Object.keys(createStateDomainSnapshot(current, 'reading').state), [
    'readingSessions',
  ]);
  assert.deepEqual(Object.keys(createStateDomainSnapshot(current, 'notes').state), ['notes']);
  assert.deepEqual(Object.keys(createStateDomainSnapshot(current, 'highlights').state), [
    'highlights',
  ]);
  for (const domain of ['reading', 'highlights']) {
    const merged = mergeStateDomainSnapshot(current, { version: 35, state: { notes: [] } }, domain);
    assert.deepEqual(merged.state.notes, current.state.notes);
    assert.equal(
      serializeStateDomainSnapshot(merged, 'notes').etag,
      serializeStateDomainSnapshot(current, 'notes').etag,
    );
  }
  const changedNotes = mergeStateDomainSnapshot(
    current,
    { version: 35, state: { notes: [{ id: 'note', content: '修订正文' }], highlights: [] } },
    'notes',
  );
  assert.deepEqual(changedNotes.state.highlights, current.state.highlights);
  assert.equal(
    serializeStateDomainSnapshot(changedNotes, 'highlights').etag,
    serializeStateDomainSnapshot(current, 'highlights').etag,
  );
});

test('AI 草稿属于偏好分区，旧快照不能恢复已发送草稿或覆盖其他对话', () => {
  const draft = { resourceId: 'book', conversationId: 'one', text: '', updatedAt: 3 };
  const current = { version: 39, state: { conversationDrafts: [draft] } };
  const incoming = {
    version: 39,
    state: {
      conversationDrafts: [
        { ...draft, text: '旧问题', updatedAt: 1 },
        { ...draft, conversationId: 'two', text: '另一问题' },
      ],
    },
  };
  const merged = mergeStateDomainSnapshot(current, incoming, 'preferences');
  assert.deepEqual(merged.state.conversationDrafts, [draft, incoming.state.conversationDrafts[1]]);
  assert.deepEqual(createStateDomainSnapshot(current, 'preferences').state.conversationDrafts, [
    draft,
  ]);
});

test('旧快照的可选配置、书籍删除时间和未知字段保持兼容', () => {
  const legacy = {
    version: 1,
    futureEnvelopeField: { retained: true },
    state: {
      books: [{ id: 'book-1', deletedAt: 100 }],
      aiPreferences: { model: 'legacy-model' },
      readerPreferences: { fontSize: 20 },
      rssDigestSettings: { enabled: false },
      rssItems: [{ id: 'legacy-rss', aiSummary: '已有摘要' }],
      videoResources: [{ id: 'legacy-video' }],
      videoTimestampNotes: [{ id: 'legacy-timestamp' }],
      futureStateField: { retained: true },
    },
  };
  const merged = mergeStateDomainSnapshot(
    legacy,
    { version: 42, state: { bookLists: [], futureStateField: { retained: false } } },
    'library',
  );
  assert.deepEqual(merged, {
    ...legacy,
    version: 42,
    state: { ...legacy.state, bookLists: [] },
  });
  assert.deepEqual(createStateDomainSnapshot(merged, 'library').state, {
    books: legacy.state.books,
    bookLists: [],
  });
  assert.deepEqual(createStateDomainSnapshot(merged, 'preferences').state, {
    aiPreferences: legacy.state.aiPreferences,
    readerPreferences: legacy.state.readerPreferences,
  });
  assert.throws(() => createStateDomainSnapshot(merged, 'rss'), {
    status: 404,
  });
});
