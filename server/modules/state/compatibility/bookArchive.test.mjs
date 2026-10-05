import assert from 'node:assert/strict';
import { test } from 'node:test';
import { protectBookTrashStateFromClient } from './bookTrash.js';

const original = { id: 'book', title: '保留的书名', progress: 10, updatedAt: 100, pinnedAt: 5 };
function merge(currentBook, incomingBook, version = 37) {
  return protectBookTrashStateFromClient(
    { version, state: { books: [incomingBook], bookLists: [] } },
    { version: 37, state: { books: [currentBook], bookLists: [] } },
  ).state.books[0];
}

test('旧客户端和晚到的阅读进度保存不会撤销存档', () => {
  const archived = { ...original, archivedAt: 10, archiveUpdatedAt: 10 };
  assert.deepEqual(merge(archived, { ...original, progress: 40, updatedAt: 200 }, 36), {
    ...archived,
    progress: 40,
    updatedAt: 200,
  });
  assert.equal(
    merge(archived, { ...original, archiveUpdatedAt: 9, updatedAt: 300 }).archivedAt,
    10,
  );
});

test('存档修改独立于阅读版本合并，并保留取消存档的版本', () => {
  const archived = { ...original, archivedAt: 10, archiveUpdatedAt: 10 };
  assert.deepEqual(merge(original, { ...archived, updatedAt: 1 }), archived);
  const active = merge(archived, { ...original, archiveUpdatedAt: 20, updatedAt: 1 });
  assert.equal(active.archivedAt, undefined);
  assert.equal(active.archiveUpdatedAt, 20);
  assert.equal(active.updatedAt, 100);
  assert.deepEqual(merge(active, { ...archived, progress: 80, updatedAt: 300 }), {
    ...original,
    archiveUpdatedAt: 20,
    progress: 80,
    updatedAt: 300,
  });
});
