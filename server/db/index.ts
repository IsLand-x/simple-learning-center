import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { statSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { getDbFile } from '../config.js';
import * as schema from './schema.js';

let dbInstance: BetterSQLite3Database<typeof schema> | undefined;
let sqliteInstance: Database.Database | undefined;
let currentDbFile: string | undefined;
let currentDbIno: bigint | undefined;

export function initDatabase(dbFilePath: string = getDbFile()) {
  let fileIno: bigint | undefined;
  try {
    fileIno = statSync(dbFilePath, { bigint: true }).ino;
  } catch {
    // Ignore missing file
  }

  if (
    dbInstance &&
    sqliteInstance &&
    currentDbFile === dbFilePath &&
    sqliteInstance.open &&
    fileIno !== undefined &&
    currentDbIno === fileIno
  ) {
    return { db: dbInstance, sqlite: sqliteInstance };
  }
  if (sqliteInstance) {
    try {
      sqliteInstance.close();
    } catch {
      // Ignore close errors
    }
    sqliteInstance = undefined;
    dbInstance = undefined;
    currentDbFile = undefined;
  }

  mkdirSync(dirname(dbFilePath), { recursive: true });
  const sqlite = new Database(dbFilePath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  // Ensure tables exist
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS books (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL DEFAULT 'epub',
      title TEXT NOT NULL DEFAULT '',
      author TEXT NOT NULL DEFAULT '',
      file_name TEXT NOT NULL DEFAULT '',
      file_size INTEGER NOT NULL DEFAULT 0,
      cover_data_url TEXT,
      created_at INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT 0,
      pinned_at INTEGER,
      archived_at INTEGER,
      archive_updated_at INTEGER,
      progress REAL NOT NULL DEFAULT 0,
      current_cfi TEXT,
      current_chapter TEXT NOT NULL DEFAULT '',
      current_page INTEGER,
      total_pages INTEGER,
      toc TEXT NOT NULL DEFAULT '[]',
      deleted_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS book_lists (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      book_ids TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS trashed_books (
      book_id TEXT PRIMARY KEY,
      book TEXT NOT NULL,
      deleted_at INTEGER NOT NULL,
      book_list_positions TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS deleted_book_tombstones (
      book_id TEXT PRIMARY KEY,
      deleted_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS highlights (
      id TEXT PRIMARY KEY,
      book_id TEXT NOT NULL,
      kind TEXT,
      definition TEXT,
      text TEXT NOT NULL DEFAULT '',
      cfi TEXT NOT NULL DEFAULT '',
      chapter TEXT NOT NULL DEFAULT '',
      page INTEGER,
      comment TEXT,
      comment_updated_at INTEGER,
      created_at INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS deleted_highlight_tombstones (
      highlight_id TEXT PRIMARY KEY,
      book_id TEXT NOT NULL,
      deleted_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      book_id TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      file_name TEXT,
      content_file TEXT,
      created_at INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS deleted_note_tombstones (
      note_id TEXT PRIMARY KEY,
      book_id TEXT NOT NULL,
      deleted_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS reading_sessions (
      id TEXT PRIMARY KEY,
      book_id TEXT NOT NULL,
      started_at INTEGER NOT NULL DEFAULT 0,
      ended_at INTEGER NOT NULL DEFAULT 0,
      duration_ms INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS chapter_mind_maps (
      id TEXT PRIMARY KEY,
      version INTEGER NOT NULL DEFAULT 1,
      revision INTEGER NOT NULL DEFAULT 1,
      book_id TEXT NOT NULL,
      chapter_id TEXT NOT NULL,
      chapter_title TEXT NOT NULL,
      nodes TEXT NOT NULL,
      model TEXT NOT NULL,
      generated_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chapter_videos (
      id TEXT PRIMARY KEY,
      version INTEGER NOT NULL DEFAULT 1,
      book_id TEXT NOT NULL,
      chapter_id TEXT,
      chapter_title TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      coverage TEXT,
      scenes TEXT NOT NULL,
      duration_seconds REAL NOT NULL DEFAULT 0,
      has_audio INTEGER NOT NULL DEFAULT 0,
      model TEXT NOT NULL,
      generated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chat_sessions (
      id TEXT PRIMARY KEY,
      book_id TEXT NOT NULL,
      title TEXT NOT NULL,
      provider TEXT,
      model TEXT,
      reasoning_effort TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chats (
      id TEXT PRIMARY KEY,
      book_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      dialogue_content TEXT,
      read_at INTEGER,
      quote TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS conversation_drafts (
      resource_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      text TEXT NOT NULL DEFAULT '',
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (resource_id, conversation_id)
    );

    CREATE TABLE IF NOT EXISTS openai_configs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      base_url TEXT NOT NULL DEFAULT '',
      api_key TEXT NOT NULL DEFAULT '',
      models TEXT NOT NULL DEFAULT '[]',
      oauth_provider TEXT,
      created_at INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS key_values (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  const db = drizzle(sqlite, { schema });
  dbInstance = db;
  sqliteInstance = sqlite;
  currentDbFile = dbFilePath;
  try {
    currentDbIno = statSync(dbFilePath, { bigint: true }).ino;
  } catch {
    // Ignore missing file
  }

  return { db, sqlite };
}

export function getDatabase() {
  const targetDbFile = getDbFile();
  let fileIno: bigint | undefined;
  try {
    fileIno = statSync(targetDbFile, { bigint: true }).ino;
  } catch {
    // Ignore missing file
  }

  if (
    !dbInstance ||
    !sqliteInstance ||
    currentDbFile !== targetDbFile ||
    !sqliteInstance.open ||
    fileIno === undefined ||
    currentDbIno !== fileIno
  ) {
    return initDatabase(targetDbFile);
  }
  return { db: dbInstance, sqlite: sqliteInstance };
}
