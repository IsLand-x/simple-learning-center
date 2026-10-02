import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  createModels,
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall,
} from '@earendil-works/pi-ai';

const dataDirectory = await mkdtemp(join(tmpdir(), 'learning-center-ai-notes-'));
process.env.LEARNING_CENTER_DATA_DIR = dataDirectory;

const { runServerAiChat } = await import('./chat.js');
const { createBookNote, readBookNotes, updateBookNote } = await import('../books/notes.js');
const { protectClientState } = await import('../state/compatibility/clientState.js');
const { writePersistedState, readPersistedState } = await import('../state/stateStore.js');

test('AI 阅读笔记支持创建、读取和带版本保护的编辑', async (t) => {
  t.after(() => rm(dataDirectory, { force: true, recursive: true }));
  await writePersistedState({
    version: 26,
    state: {
      books: [{ id: 'book-a', title: '测试书' }],
      notes: [],
    },
  });

  const emptyBrowserSnapshot = await readPersistedState();
  const faux = fauxProvider({ tokensPerSecond: 0 });
  faux.setResponses([
    fauxAssistantMessage(fauxToolCall('read_book_notes', {}), { stopReason: 'toolUse' }),
    fauxAssistantMessage(fauxToolCall('create_book_note', { content: '# 初稿\n\n第一版' }), {
      stopReason: 'toolUse',
    }),
    fauxAssistantMessage('笔记已保存'),
  ]);
  const models = createModels();
  models.setProvider(faux.provider);
  let changes = 0;
  await runServerAiChat({
    config: { baseUrl: 'https://example.invalid/v1', apiKey: 'test-only' },
    model: 'mock',
    conversationId: 'note-conversation',
    resourceType: 'book',
    messages: [{ role: 'user', content: '请记到笔记里', createdAt: 1 }],
    book: { id: 'book-a', title: '测试书', author: '', progress: 0, currentChapter: '', toc: [] },
    currentText: '',
    notes: [],
    highlights: [],
    readingSessions: [],
    webSearchConfig: {},
    runtimeFactory: () => ({ models, model: faux.getModel() }),
    onNoteChange: () => {
      changes++;
    },
  });
  assert.equal(changes, 1);
  const created = (await readBookNotes('book-a'))[0];
  assert.equal(created.id, 'book-note:book-a');
  assert.equal(created.fileName, 'reading-note.md');

  await writePersistedState(emptyBrowserSnapshot, false, (incoming, current) =>
    protectClientState((state) => state, incoming, current),
  );
  const listed = await readBookNotes('book-a');
  assert.equal(listed.length, 1);
  assert.equal(listed[0].content, '# 初稿\n\n第一版');

  const staleBrowserSnapshot = await readPersistedState();
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
  await assert.rejects(createBookNote('book-a', '测试书', '重复笔记'), /已经存在阅读笔记/);

  // An unrelated reading-progress write must not undo a successful AI edit.
  await writePersistedState(staleBrowserSnapshot, false, (incoming, current) =>
    protectClientState((state) => state, incoming, current),
  );
  const finalNotes = await readBookNotes('book-a');
  assert.equal(finalNotes[0].content, '# 修订稿\n\n第二版');
  const diskState = JSON.parse(await readFile(join(dataDirectory, 'state.json'), 'utf8'));
  const path = join(dataDirectory, diskState.persistedState.state.notes[0].contentFile);
  assert.equal(await readFile(path, 'utf8'), '# 修订稿\n\n第二版');

  const deletedSnapshot = await readPersistedState();
  deletedSnapshot.state.notes = [];
  deletedSnapshot.state.deletedNoteTombstones = [
    { noteId: created.id, bookId: 'book-a', deletedAt: updated.updatedAt + 1 },
  ];
  await writePersistedState(deletedSnapshot, false, (incoming, current) =>
    protectClientState((state) => state, incoming, current),
  );
  assert.deepEqual(await readBookNotes('book-a'), []);
  await assert.rejects(readFile(path), { code: 'ENOENT' });
  await writePersistedState(staleBrowserSnapshot, false, (incoming, current) =>
    protectClientState((state) => state, incoming, current),
  );
  assert.deepEqual(await readBookNotes('book-a'), []);
  const recreated = await createBookNote('book-a', '测试书', '重新创建');
  assert.ok(recreated.updatedAt > updated.updatedAt + 1);
});
