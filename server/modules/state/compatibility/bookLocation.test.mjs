import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeBookFields } from './bookLocation.js';

const book = (progress, updatedAt, extra = {}) => ({
  id: 'book',
  kind: 'epub',
  title: '书',
  author: '',
  fileName: '',
  fileSize: 1,
  createdAt: 1,
  updatedAt,
  progress,
  currentCfi: `cfi-${progress}`,
  currentChapter: '章',
  toc: [],
  ...extra,
});

test('改名的新时间不能覆盖另一台设备已记录的阅读位置', () => {
  const merged = mergeBookFields(
    book(5, 100, { title: '新名', locationUpdatedAt: 5 }),
    book(80, 40, { locationUpdatedAt: 40 }),
  );
  assert.equal(merged.title, '新名');
  assert.equal(merged.progress, 80);
  assert.equal(merged.currentCfi, 'cfi-80');
  assert.equal(merged.locationUpdatedAt, 40);
});

test('没有位置时钟的旧客户端不能覆盖已有位置时钟', () => {
  const merged = mergeBookFields(
    book(5, 100, { title: '旧客户端改名' }),
    book(80, 40, { locationUpdatedAt: 40 }),
  );
  assert.equal(merged.title, '旧客户端改名');
  assert.equal(merged.progress, 80);
  assert.equal(merged.locationUpdatedAt, 40);
});

test('两份旧快照仍按整书时间合并', () => {
  const merged = mergeBookFields(book(5, 100), book(80, 40));
  assert.equal(merged.progress, 5);
  assert.equal(merged.locationUpdatedAt, undefined);
});
