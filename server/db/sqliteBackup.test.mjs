import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';

const directory = await mkdtemp(join(tmpdir(), 'sqlite-backup-test-'));
process.env.LEARNING_CENTER_DATA_DIR = directory;
const { initDatabase, getDatabase } = await import('./index.js');
const { writeStateToDb, readStateFromDb } = await import('./sqliteStateStorage.js');
const { backupSqliteDatabase, restoreSqliteDatabase } = await import('./sqliteBackup.js');

after(() => rm(directory, { recursive: true, force: true }));

test('在线备份包含 WAL 中尚未检查点的提交，恢复不会套用旧 WAL', async () => {
  const dbFilePath = join(directory, 'learning-center.db');
  const backupPath = join(directory, 'backups', 'state.db');
  initDatabase(dbFilePath);
  writeStateToDb({
    version: 42,
    state: { books: [{ id: 'book', title: '备份时的书', progress: 10, updatedAt: 1 }] },
  });
  const live = getDatabase().sqlite;
  live.pragma('wal_checkpoint(PASSIVE)');
  writeStateToDb({
    version: 42,
    state: { books: [{ id: 'book', title: '备份时的书', progress: 40, updatedAt: 2 }] },
  });
  await backupSqliteDatabase(backupPath);
  writeStateToDb({
    version: 42,
    state: { books: [{ id: 'book', title: '备份后的修改', progress: 90, updatedAt: 3 }] },
  });

  const opened = new Database(backupPath, { readonly: true, fileMustExist: true });
  const progress = opened.prepare('select progress from books where id = ?').get('book');
  opened.close();
  assert.equal(progress.progress, 40);

  await restoreSqliteDatabase(backupPath, dbFilePath);
  assert.equal(readStateFromDb()?.state.books?.[0]?.progress, 40);
  assert.equal(readStateFromDb()?.state.books?.[0]?.title, '备份时的书');
});
