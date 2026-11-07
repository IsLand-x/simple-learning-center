import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { DB_FILE, STATE_FILE } from '../config.js';
import { initDatabase } from './index.js';
import {
  databaseHasUserData,
  STATE_JSON_IMPORT_KEY,
  writeStateToDb,
} from './sqliteStateStorage.js';
import type { NoteItem } from '../../contracts/reading.js';
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

async function loadDiskNoteContents(dataDirectory: string, notes: unknown) {
  const contents = new Map<string, string>();
  if (!Array.isArray(notes)) return contents;
  for (const item of notes as Array<NoteItem & { contentFile?: string }>) {
    if (!item || typeof item !== 'object' || typeof item.id !== 'string') continue;
    if (typeof item.content === 'string' && item.content.length > 0) {
      contents.set(item.id, item.content);
      continue;
    }
    if (typeof item.contentFile === 'string') {
      const targetPath = resolve(dataDirectory, item.contentFile);
      if (targetPath === dataDirectory || !targetPath.startsWith(`${dataDirectory}${sep}`)) {
        continue;
      }
      try {
        contents.set(item.id, await readFile(targetPath, 'utf8'));
      } catch {
        // A missing note file is retained as an empty body and can be repaired later.
      }
    }
  }
  return contents;
}

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
  const version = Number.isInteger(persistedState.version)
    ? (persistedState.version as number)
    : 42;
  const deletedConversationIds = Array.isArray(persistedState.deletedConversationIds)
    ? persistedState.deletedConversationIds
    : undefined;

  try {
    const noteContents = await loadDiskNoteContents(dirname(stateFilePath), state.notes);
    writeStateToDb(
      {
        version,
        ...(deletedConversationIds ? { deletedConversationIds } : {}),
        state,
      },
      undefined,
      noteContents,
      { [STATE_JSON_IMPORT_KEY]: 'imported' },
    );
    return { migrated: true };
  } catch (error) {
    console.error('从 state.json 导入 SQLite 失败，数据库未标记为已导入:', error);
    return { migrated: false, reason: 'transaction_failed', blocking: true, error };
  }
}
