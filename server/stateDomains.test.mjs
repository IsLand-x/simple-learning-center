import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createStateDomainSnapshot,
  mergeStateDomainSnapshot,
  serializeStateDomainSnapshot,
} from './stateDomains.mjs';

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

  assert.deepEqual(createStateDomainSnapshot(current, 'reading'), {
    state: { highlights: [{ id: 'highlight-1' }] },
    version: 28,
  });

  const merged = mergeStateDomainSnapshot(current, {
    state: { highlights: [{ id: 'highlight-2' }], books: [] },
    version: 28,
  }, 'reading');
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
