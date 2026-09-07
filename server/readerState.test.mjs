import assert from 'node:assert/strict';
import test from 'node:test';
import { protectReaderStateFromClient } from './readerState.mjs';

function preferences(theme, fontSize) {
  return {
    fontSize,
    lineHeight: 1.8,
    theme,
    fontFamily: 'kai',
    customStyle: {
      fontFamily: 'kai',
      paperColor: '#ffffff',
      textColor: '#111111',
      texture: 'none',
      fontSize,
      density: 'comfortable',
    },
    tocWidth: 272,
    panelWidth: 380,
    tocCollapsed: false,
  };
}

function highlight(id, updatedAt, text = id) {
  return {
    id,
    bookId: 'book-1',
    kind: 'highlight',
    text,
    cfi: `epubcfi(/6/${updatedAt})`,
    chapter: '第一章',
    createdAt: updatedAt,
    updatedAt,
  };
}

test('旧设备快照不会清除新高亮或回退阅读样式', () => {
  const current = {
    version: 26,
    state: {
      highlights: [highlight('server-highlight', 200)],
      deletedHighlightTombstones: [],
      readerPreferences: preferences('ink', 22),
      readerPreferencesUpdatedAt: 200,
    },
  };
  const stale = {
    version: 25,
    state: {
      highlights: [],
      readerPreferences: preferences('paper', 16),
    },
  };

  const merged = protectReaderStateFromClient(stale, current);

  assert.equal(merged.version, 26);
  assert.equal(merged.state.highlights[0].id, 'server-highlight');
  assert.equal(merged.state.readerPreferences.theme, 'ink');
  assert.equal(merged.state.readerPreferences.fontSize, 22);
  assert.equal(merged.state.readerPreferencesUpdatedAt, 200);
});

test('不同设备新增的高亮会合并，较新的阅读样式会生效', () => {
  const current = {
    version: 26,
    state: {
      highlights: [highlight('device-a', 200)],
      deletedHighlightTombstones: [],
      readerPreferences: preferences('paper', 18),
      readerPreferencesUpdatedAt: 200,
    },
  };
  const incoming = {
    version: 26,
    state: {
      highlights: [highlight('device-b', 300)],
      deletedHighlightTombstones: [],
      readerPreferences: preferences('ink', 24),
      readerPreferencesUpdatedAt: 300,
    },
  };

  const merged = protectReaderStateFromClient(incoming, current);

  assert.deepEqual(new Set(merged.state.highlights.map((item) => item.id)), new Set(['device-a', 'device-b']));
  assert.equal(merged.state.readerPreferences.theme, 'ink');
  assert.equal(merged.state.readerPreferences.fontSize, 24);
  assert.equal(merged.state.readerPreferencesUpdatedAt, 300);
});

test('高亮删除墓碑会阻止旧设备把已删除高亮重新带回', () => {
  const current = {
    version: 26,
    state: {
      highlights: [highlight('deleted-highlight', 200)],
      deletedHighlightTombstones: [],
      readerPreferences: preferences('paper', 18),
      readerPreferencesUpdatedAt: 100,
    },
  };
  const deletion = {
    version: 26,
    state: {
      highlights: [],
      deletedHighlightTombstones: [{
        highlightId: 'deleted-highlight',
        bookId: 'book-1',
        deletedAt: 300,
      }],
      readerPreferences: preferences('paper', 18),
      readerPreferencesUpdatedAt: 100,
    },
  };
  const afterDeletion = protectReaderStateFromClient(deletion, current);
  const staleDevice = {
    version: 26,
    state: {
      highlights: [highlight('deleted-highlight', 200)],
      deletedHighlightTombstones: [],
      readerPreferences: preferences('paper', 18),
      readerPreferencesUpdatedAt: 100,
    },
  };

  const merged = protectReaderStateFromClient(staleDevice, afterDeletion);

  assert.deepEqual(merged.state.highlights, []);
  assert.equal(merged.state.deletedHighlightTombstones[0].highlightId, 'deleted-highlight');
  assert.equal(merged.state.deletedHighlightTombstones[0].deletedAt, 300);
});
