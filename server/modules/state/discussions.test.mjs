import assert from 'node:assert/strict';
import { test } from 'node:test';
import { protectReaderStateFromClient } from './compatibility/readerState.js';
import { createStateDomainSnapshot, mergeStateDomainSnapshot } from './domains.js';
import { permanentlyDeleteBookInState } from './compatibility/bookTrash.js';

const item = {
  id: 'discussion',
  bookId: 'book',
  question: '问题',
  content: '回答',
  source: {
    chapter: '第一章',
    href: 'chapter.xhtml',
    cfi: 'epubcfi(/6/2)',
    passageId: '',
    quote: '',
  },
  createdAt: 1,
  updatedAt: 2,
};
test('永久删除书籍同步清理讨论', () => {
  const state = {
    version: 43,
    state: {
      books: [{ id: 'book' }],
      discussions: [item, { ...item, id: 'other', bookId: 'other' }],
    },
  };
  permanentlyDeleteBookInState(state, 'book', 10);
  assert.deepEqual(
    state.state.discussions.map((entry) => entry.id),
    ['other'],
  );
});

test('讨论属于阅读分区，旧客户端不能覆盖编辑或恢复已删除讨论', () => {
  const current = {
    version: 43,
    state: { discussions: [{ ...item, content: '编辑', updatedAt: 4 }] },
  };
  assert.deepEqual(
    createStateDomainSnapshot(current, 'reading').state.discussions,
    current.state.discussions,
  );
  assert.equal(createStateDomainSnapshot(current, 'notes').state.discussions, undefined);
  const incoming = mergeStateDomainSnapshot(
    current,
    { version: 42, state: { discussions: [item] } },
    'reading',
  );
  assert.equal(
    protectReaderStateFromClient(incoming, current).state.discussions[0].content,
    '编辑',
  );
  const deleted = { version: 43, state: { discussions: [{ ...item, content: '', deletedAt: 5 }] } };
  assert.equal(protectReaderStateFromClient(incoming, deleted).state.discussions[0].deletedAt, 5);
  assert.deepEqual(
    protectReaderStateFromClient({ version: 42, state: {} }, current).state.discussions,
    current.state.discussions,
  );
});
