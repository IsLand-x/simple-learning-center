import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CURRENT_STATE_VERSION,
  mergeScopedStatePatch,
  projectPersistedState,
} from './stateScopes.mjs';

function fixture() {
  return {
    version: 25,
    state: {
      navCollapsed: false,
      themeMode: 'light',
      books: [
        { id: 'book-a', title: 'A', updatedAt: 1 },
        { id: 'book-b', title: 'B', updatedAt: 1 },
      ],
      highlights: [
        { id: 'h-a', bookId: 'book-a', text: 'A' },
        { id: 'h-b', bookId: 'book-b', text: 'B' },
      ],
      notes: [
        { id: 'n-a', bookId: 'book-a', content: 'A' },
        { id: 'n-video', bookId: 'video:one', content: 'V' },
      ],
      chats: [
        { id: 'c-a', bookId: 'book-a' },
        { id: 'c-rss', bookId: 'rss:one' },
      ],
      rssItems: [{ id: 'rss-one' }],
      openAIConfigs: [{ id: 'config' }],
    },
  };
}

test('作用域快照不会在首屏返回业务内容', () => {
  const projected = projectPersistedState(fixture(), { scopes: ['shell'], bookIds: [] });
  assert.equal(projected.version, CURRENT_STATE_VERSION);
  assert.deepEqual(projected.state, { navCollapsed: false, themeMode: 'light' });
});

test('阅读器快照只包含当前书籍的资源', () => {
  const projected = projectPersistedState(fixture(), { scopes: ['reader'], bookIds: ['book-a'] });
  assert.deepEqual(projected.state.books.map((book) => book.id), ['book-a']);
  assert.deepEqual(projected.state.highlights.map((item) => item.id), ['h-a']);
  assert.deepEqual(projected.state.notes.map((item) => item.id), ['n-a']);
  assert.deepEqual(projected.state.chats.map((item) => item.id), ['c-a']);
  assert.equal('rssItems' in projected.state, false);
});

test('阅读器增量保存保留其他书籍的数据', () => {
  const merged = mergeScopedStatePatch(fixture(), {
    version: CURRENT_STATE_VERSION,
    scopes: ['reader'],
    bookIds: ['book-a'],
    state: {
      books: [{ id: 'book-a', title: 'A2', updatedAt: 2 }, { id: 'book-x', title: 'X' }],
      highlights: [{ id: 'h-a2', bookId: 'book-a', text: 'A2' }],
    },
  });
  assert.deepEqual(merged.state.books.map((book) => book.id), ['book-a', 'book-b']);
  assert.equal(merged.state.books[0].title, 'A2');
  assert.deepEqual(merged.state.highlights.map((item) => item.id), ['h-b', 'h-a2']);
});
