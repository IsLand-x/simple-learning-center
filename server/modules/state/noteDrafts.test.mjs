import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const directory = await mkdtemp(join(tmpdir(), 'note-drafts-'));
process.env.LEARNING_CENTER_DATA_DIR = directory;
after(() => rm(directory, { recursive: true, force: true }));
const { mergeNoteDraft } = await import('./noteDrafts.js');
const { writePersistedState, readPersistedState } = await import('./stateStore.js');
const { appendBookNote, readBookNotes } = await import('../books/notes.js');
const { createApp } = await import('../../app.js');

test('笔记的独立修改合并，同段冲突保留完整草稿', () => {
  assert.equal(mergeNoteDraft('原文', '用户原文', '原文\nAI'), '用户原文\nAI');
  assert.equal(mergeNoteDraft('', '用户', 'AI'), 'AI\n\n用户');
  assert.equal(mergeNoteDraft('原文', '原文', 'AI'), 'AI');
  assert.equal(mergeNoteDraft('原文', '用户', '原文'), '用户');
  const conflict = mergeNoteDraft('原文', '用户', 'AI');
  assert.match(conflict, /^AI/);
  assert.match(conflict, /并发修改.*本地草稿/);
  assert.match(conflict, /用户$/);
});
test('浏览器自动保存与 AI 原子追加并发，正文和队列均保留所有内容', async () => {
  await writePersistedState({
    version: 36,
    state: { books: [{ id: 'book', title: '书' }], notes: [], deletedNoteTombstones: [] },
  });
  const app = createApp({ mode: 'local', serveFrontend: false });
  const first = await appendBookNote('book', '书', '原文');
  await Promise.all([appendBookNote('book', '书', 'AI 一'), appendBookNote('book', '书', 'AI 二')]);
  const draft = { ...first, bookId: 'book', content: '用户原文', updatedAt: Date.now() + 100 };
  const response = await app.request('/api/state/notes', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      version: 36,
      state: { notes: [draft] },
      notesBase: [{ ...first, bookId: 'book' }],
    }),
  });
  assert.equal(response.status, 200);
  const saved = await response.json();
  assert.equal(saved.state.notes[0].content, '用户原文\n\nAI 一\n\nAI 二');
  assert.equal((await readBookNotes('book'))[0].content, saved.state.notes[0].content);
  // The next queued keystroke uses the previous local draft as its base.
  const second = await app.request('/api/state/notes', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      version: 36,
      state: { notes: [{ ...draft, content: '用户继续原文', updatedAt: draft.updatedAt + 1 }] },
      notesBase: [draft],
    }),
  });
  assert.equal((await second.json()).state.notes[0].content, '用户继续原文\n\nAI 一\n\nAI 二');
  assert.equal((await readPersistedState()).state.notes.length, 1);
  const malformed = await app.request('/api/state/notes', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ version: 36, state: {}, notesBase: [null] }),
  });
  assert.equal(malformed.status, 400);
});

test('追加时合并旧版多篇笔记，保留每篇标题和正文', async () => {
  const older = {
    id: 'legacy-one',
    bookId: 'legacy',
    title: '第一篇标题',
    content: '第一篇正文',
    createdAt: 1,
    updatedAt: 1,
  };
  await writePersistedState({
    version: 36,
    state: {
      books: [{ id: 'legacy', title: '旧书' }],
      notes: [
        older,
        {
          ...older,
          id: 'legacy-two',
          title: '第二篇标题',
          content: '第二篇正文',
          createdAt: 2,
          updatedAt: 2,
        },
      ],
    },
  });
  const appended = await appendBookNote('legacy', '旧书', 'AI 新增');
  assert.equal(
    appended.content,
    '## 第一篇标题\n\n第一篇正文\n\n---\n\n## 第二篇标题\n\n第二篇正文\n\nAI 新增',
  );
  const state = await readPersistedState();
  assert.equal(state.state.notes.length, 1);
  assert.ok(state.state.deletedNoteTombstones.some((item) => item.noteId === 'legacy-two'));
});
