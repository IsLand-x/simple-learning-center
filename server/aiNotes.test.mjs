import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const dataDirectory = await mkdtemp(join(tmpdir(), 'learning-center-ai-notes-'));
process.env.LEARNING_CENTER_DATA_DIR = dataDirectory;

const { createBookNote, readBookNotes, updateBookNote } = await import('./aiNotes.mjs');
const { writePersistedState } = await import('./storage.mjs');

test('AI 阅读笔记支持创建、读取和带版本保护的编辑', async (t) => {
  t.after(() => rm(dataDirectory, { force: true, recursive: true }));
  await writePersistedState({
    version: 26,
    state: {
      books: [{ id: 'book-a', title: '测试书' }],
      notes: [],
    },
  });

  const created = await createBookNote('book-a', '测试书', '# 初稿\n\n第一版');
  assert.equal(created.id, 'book-note:book-a');
  assert.equal(created.fileName, 'reading-note.md');

  const listed = await readBookNotes('book-a');
  assert.equal(listed.length, 1);
  assert.equal(listed[0].content, '# 初稿\n\n第一版');

  const updated = await updateBookNote(
    'book-a',
    created.id,
    created.updatedAt,
    '# 修订稿\n\n第二版',
  );
  assert.equal(updated.content, '# 修订稿\n\n第二版');
  assert.ok(updated.updatedAt > created.updatedAt);

  await assert.rejects(
    updateBookNote('book-a', created.id, created.updatedAt, '过期版本'),
    /笔记已在其他位置更新/,
  );
  await assert.rejects(
    createBookNote('book-a', '测试书', '重复笔记'),
    /已经存在阅读笔记/,
  );

  const finalNotes = await readBookNotes('book-a');
  assert.equal(finalNotes[0].content, '# 修订稿\n\n第二版');
});
