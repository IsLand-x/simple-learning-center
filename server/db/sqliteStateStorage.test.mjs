import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';

const directory = await mkdtemp(join(tmpdir(), 'sqlite-storage-test-'));
process.env.LEARNING_CENTER_DATA_DIR = directory;

const { initDatabase } = await import('./index.js');
const schema = await import('./schema.js');
const { readStateFromDb, writeStateToDb } = await import('./sqliteStateStorage.js');
const { migrateFromStateJson } = await import('./migrateFromStateJson.js');
const { atomicWrite } = await import('../infrastructure/fs/files.js');

beforeEach(async () => {
  await rm(directory, { recursive: true, force: true });
});
after(() => rm(directory, { recursive: true, force: true }));

test('migrateFromStateJson 将远端 state.json 与笔记正文完整迁移至 SQLite 且支持增量分区更新', async () => {
  const stateFilePath = join(directory, 'state.json');
  const dbFilePath = join(directory, 'learning-center.db');
  await atomicWrite(join(directory, 'notes/book-1/note-1.md'), '# 远端笔记正文');
  await atomicWrite(
    stateFilePath,
    JSON.stringify({
      formatVersion: 1,
      updatedAt: '2026-10-31T00:00:00.000Z',
      persistedState: {
        version: 42,
        deletedConversationIds: ['deleted-conv-1'],
        state: {
          books: [
            {
              id: 'book-1',
              kind: 'epub',
              title: '远端书籍',
              author: '作者',
              fileName: 'book-1.epub',
              fileSize: 1024,
              createdAt: 100,
              updatedAt: 200,
              progress: 45,
              currentCfi: 'epubcfi(/6/2)',
              currentChapter: '第一章',
              toc: [],
            },
          ],
          bookLists: [
            {
              id: 'list-1',
              name: '在读书单',
              note: '重点',
              bookIds: ['book-1'],
              createdAt: 100,
              updatedAt: 200,
            },
          ],
          highlights: [
            {
              id: 'hl-1',
              bookId: 'book-1',
              text: '重要划线',
              cfi: 'epubcfi(/6/2)',
              chapter: '第一章',
              createdAt: 150,
              updatedAt: 150,
            },
          ],
          notes: [
            {
              id: 'note-1',
              bookId: 'book-1',
              title: '读书笔记',
              contentFile: 'notes/book-1/note-1.md',
              createdAt: 120,
              updatedAt: 180,
            },
          ],
          chats: [
            {
              id: 'msg-1',
              bookId: 'book-1',
              conversationId: 'conv-1',
              role: 'user',
              content: '总结本章',
              createdAt: 190,
            },
          ],
          chatSessions: [
            {
              id: 'conv-1',
              bookId: 'book-1',
              title: '总结本章',
              createdAt: 190,
              updatedAt: 190,
            },
          ],
          themeMode: 'dark',
        },
      },
    }),
  );

  const result = await migrateFromStateJson(stateFilePath, dbFilePath);
  assert.equal(result.migrated, true);

  // Verify note Markdown body is stored inside SQLite notes.content column
  const { db } = initDatabase(dbFilePath);
  const noteRow = db.select().from(schema.notes).get();
  assert.equal(noteRow?.content, '# 远端笔记正文');
  assert.equal(noteRow?.contentFile, 'notes/book-1/note-1.md');

  // Verify partial domain update (e.g. preferences) does not lose books, notes, highlights, or chats
  writeStateToDb(
    {
      version: 42,
      deletedConversationIds: ['deleted-conv-1'],
      state: { themeMode: 'light' },
    },
    ['themeMode'],
  );

  const fullFromDb = readStateFromDb();
  assert.equal(fullFromDb?.state.themeMode, 'light');
  assert.equal(fullFromDb?.state.books?.length, 1);
  assert.equal(fullFromDb?.state.books?.[0]?.title, '远端书籍');
  assert.equal(fullFromDb?.state.highlights?.length, 1);
  assert.equal(fullFromDb?.state.notes?.length, 1);
  assert.equal(fullFromDb?.state.chats?.length, 1);
  assert.deepEqual(fullFromDb?.deletedConversationIds, ['deleted-conv-1']);

  // Verify second startup skips migration when DB is already complete
  const secondRun = await migrateFromStateJson(stateFilePath, dbFilePath);
  assert.equal(secondRun.migrated, false);
  assert.equal(secondRun.reason, 'database_already_has_data');

  // Verify self-healing if an older DB was missing __storedFields
  db.delete(schema.keyValues)
    .where(sql`${schema.keyValues.key} = '__storedFields'`)
    .run();
  const repaired = await migrateFromStateJson(stateFilePath, dbFilePath);
  assert.equal(repaired.migrated, true);
});
