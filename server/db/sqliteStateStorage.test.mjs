import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
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
  assert.equal(secondRun.reason, 'database_already_initialized');

  const newer = JSON.parse(await readFile(stateFilePath, 'utf8'));
  newer.persistedState.state.books[0].title = 'JSON 里更新的书名';
  newer.persistedState.state.books[0].updatedAt = 9_999;
  await atomicWrite(stateFilePath, JSON.stringify(newer));
  db.delete(schema.keyValues)
    .where(sql`${schema.keyValues.key} = '__storedFields'`)
    .run();
  const skipped = await migrateFromStateJson(stateFilePath, dbFilePath);
  assert.equal(skipped.migrated, false);
  assert.equal(skipped.reason, 'database_already_initialized');
  assert.equal(readStateFromDb()?.state.books?.[0]?.title, '远端书籍');
});

test('损坏的 state.json 不会标记完成，修复后可以重试导入', async () => {
  const stateFilePath = join(directory, 'state.json');
  const dbFilePath = join(directory, 'learning-center.db');
  await atomicWrite(stateFilePath, '{');
  const failed = await migrateFromStateJson(stateFilePath, dbFilePath);
  assert.equal(failed.migrated, false);
  assert.equal(failed.blocking, true);
  await atomicWrite(
    stateFilePath,
    JSON.stringify({
      formatVersion: 1,
      persistedState: { version: 42, state: { books: [{ id: 'book', title: '修复后的书' }] } },
    }),
  );
  const retried = await migrateFromStateJson(stateFilePath, dbFilePath);
  assert.equal(retried.migrated, true);
  assert.equal(readStateFromDb()?.state.books?.[0]?.title, '修复后的书');
  await atomicWrite(stateFilePath, JSON.stringify({ version: 42, state: { books: [] } }));
  const again = await migrateFromStateJson(stateFilePath, dbFilePath);
  assert.equal(again.reason, 'database_already_initialized');
});

test('只有术语或偏好、没有 version 的库不会被 state.json 覆盖', async () => {
  const stateFilePath = join(directory, 'state.json');
  const dbFilePath = join(directory, 'learning-center.db');
  const { db } = initDatabase(dbFilePath);
  db.insert(schema.highlights)
    .values({
      id: 'term',
      bookId: 'book',
      text: '术语',
      cfi: 'cfi',
      chapter: '章',
      createdAt: 5,
      updatedAt: 8,
      definition: '手改释义',
    })
    .run();
  await atomicWrite(
    stateFilePath,
    JSON.stringify({
      formatVersion: 1,
      persistedState: {
        version: 42,
        state: {
          legacyRssItems: [{ id: 'old' }],
          books: [{ id: 'book', title: 'JSON 新书', progress: 1, updatedAt: 99 }],
          highlights: [],
        },
      },
    }),
  );
  const result = await migrateFromStateJson(stateFilePath, dbFilePath);
  assert.equal(result.reason, 'database_already_initialized');
  assert.equal(db.select().from(schema.highlights).get()?.definition, '手改释义');
  assert.equal((await readFile(stateFilePath, 'utf8')).includes('legacyRssItems'), true);
});

test('损坏的数据库文件不会被 state.json 静默换掉', async () => {
  const stateFilePath = join(directory, 'state.json');
  const dbFilePath = join(directory, 'learning-center.db');
  const { mkdir, writeFile } = await import('node:fs/promises');
  await mkdir(directory, { recursive: true });
  await writeFile(dbFilePath, 'not a sqlite database');
  await atomicWrite(
    stateFilePath,
    JSON.stringify({
      formatVersion: 1,
      persistedState: { version: 42, state: { books: [{ id: 'book', title: '不应导入' }] } },
    }),
  );
  const result = await migrateFromStateJson(stateFilePath, dbFilePath);
  assert.equal(result.blocking, true);
  assert.equal(await readFile(dbFilePath, 'utf8'), 'not a sqlite database');
});

test('未知书籍字段会落库，事务失败不留下半成品', async () => {
  const { writePersistedState, readPersistedState, clearPersistedStateCache } =
    await import('../modules/state/stateStore.js');
  await writePersistedState({
    version: 42,
    state: {
      books: [{ id: 'book', title: '原书', progress: 10, updatedAt: 1, vendorFlag: 'keep' }],
    },
  });
  clearPersistedStateCache();
  const saved = readStateFromDb();
  assert.equal(saved?.state.books?.[0]?.vendorFlag, 'keep');
  assert.throws(() =>
    writeStateToDb({
      version: 42,
      state: { books: [{ id: 'book', title: '失败', vendorFlag: 1n }] },
    }),
  );
  assert.equal(readStateFromDb()?.state.books?.[0]?.title, '原书');
  assert.equal(readStateFromDb()?.state.books?.[0]?.vendorFlag, 'keep');
  const visible = await readPersistedState({ fields: ['books'] });
  assert.equal(visible.state.books[0].vendorFlag, 'keep');
});

test('新写入不生成 state.json', async () => {
  const { writePersistedState } = await import('../modules/state/stateStore.js');
  const { readFile } = await import('node:fs/promises');
  await writePersistedState({ version: 42, state: { themeMode: 'dark', books: [] } });
  await assert.rejects(readFile(join(directory, 'state.json')), { code: 'ENOENT' });
  assert.equal(readStateFromDb()?.state.themeMode, 'dark');
});
