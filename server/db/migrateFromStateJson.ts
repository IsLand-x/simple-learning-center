import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { DB_FILE, STATE_FILE } from '../config.js';
import { initDatabase } from './index.js';
import {
  databaseHasUserData,
  STATE_JSON_IMPORT_KEY,
  writeStateToDb,
} from './sqliteStateStorage.js';
import type { StoredState } from '../modules/state/types.js';

interface StateJsonFormat {
  formatVersion?: number;
  updatedAt?: string;
  persistedState?: {
    version?: number;
    deletedConversationIds?: string[];
    state?: Record<string, unknown>;
  };
  version?: number;
  deletedConversationIds?: string[];
  state?: Record<string, unknown>;
}

export type StateJsonMigration =
  | { migrated: true }
  | { migrated: false; reason: 'state_file_not_found' | 'database_already_initialized' }
  | {
      migrated: false;
      reason: 'invalid_json' | 'invalid_persisted_state' | 'transaction_failed';
      blocking: true;
      error?: unknown;
    };

function databaseAlreadyInitialized(dbFilePath: string) {
  const { db } = initDatabase(dbFilePath);
  return databaseHasUserData(db);
}

export async function migrateFromStateJson(
  stateFilePath: string = STATE_FILE,
  dbFilePath: string = DB_FILE,
): Promise<StateJsonMigration> {
  if (!existsSync(stateFilePath)) return { migrated: false, reason: 'state_file_not_found' };
  try {
    if (databaseAlreadyInitialized(dbFilePath)) {
      return { migrated: false, reason: 'database_already_initialized' };
    }
  } catch (error) {
    return { migrated: false, reason: 'transaction_failed', blocking: true, error };
  }

  let parsed: StateJsonFormat;
  try {
    parsed = JSON.parse(await readFile(stateFilePath, 'utf8')) as StateJsonFormat;
  } catch (error) {
    return { migrated: false, reason: 'invalid_json', blocking: true, error };
  }

  const persistedState = parsed.formatVersion === 1 ? parsed.persistedState : parsed;
  if (!persistedState || typeof persistedState !== 'object') {
    return { migrated: false, reason: 'invalid_persisted_state', blocking: true };
  }

  const state = (persistedState.state ?? {}) as StoredState;
  // 旧快照里的阅读笔记不再迁移；生产库中已有的 notes 表保持原样。
  delete (state as Record<string, unknown>).notes;
  delete (state as Record<string, unknown>).deletedNoteTombstones;
  const version = Number.isInteger(persistedState.version)
    ? (persistedState.version as number)
    : 42;
  const deletedConversationIds = Array.isArray(persistedState.deletedConversationIds)
    ? persistedState.deletedConversationIds
    : undefined;

  try {
    writeStateToDb(
      {
        version,
        ...(deletedConversationIds ? { deletedConversationIds } : {}),
        state,
      },
      undefined,
      { [STATE_JSON_IMPORT_KEY]: 'imported' },
    );
    return { migrated: true };
  } catch (error) {
    console.error('从 state.json 导入 SQLite 失败，数据库未标记为已导入:', error);
    return { migrated: false, reason: 'transaction_failed', blocking: true, error };
  }
}
