import { mkdir, rename, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { DB_FILE } from '../config.js';
import { closeDatabase, getDatabase, initDatabase } from './index.js';

export async function backupSqliteDatabase(destination: string, source = getDatabase().sqlite) {
  await mkdir(dirname(destination), { recursive: true });
  await source.backup(destination);
}

export async function restoreSqliteDatabase(backupPath: string, dbFilePath = DB_FILE) {
  const tempPath = `${dbFilePath}.restore`;
  await rm(tempPath, { force: true });
  const source = new Database(backupPath, { readonly: true, fileMustExist: true });
  try {
    await source.backup(tempPath);
  } finally {
    source.close();
  }
  closeDatabase();
  await rename(tempPath, dbFilePath);
  await rm(`${dbFilePath}-wal`, { force: true });
  await rm(`${dbFilePath}-shm`, { force: true });
  initDatabase(dbFilePath);
}

const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (invokedDirectly) {
  const [command, file] = process.argv.slice(2);
  const run =
    command === 'backup' && file
      ? backupSqliteDatabase(file)
      : command === 'restore' && file
        ? restoreSqliteDatabase(file)
        : Promise.reject(new Error('用法: sqliteBackup.js backup <文件> | restore <文件>'));
  run.catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
