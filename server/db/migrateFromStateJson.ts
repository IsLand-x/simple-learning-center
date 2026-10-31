import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { sql } from 'drizzle-orm';
import { DB_FILE, STATE_FILE } from '../config.js';
import { initDatabase } from './index.js';
import * as schema from './schema.js';
import { writeStateToDb } from './sqliteStateStorage.js';
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

async function loadDiskNoteContents(
  dataDirectory: string,
  notes: unknown,
): Promise<Map<string, string>> {
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
        // Ignore missing note file during migration
      }
    }
  }
  return contents;
}

export async function migrateFromStateJson(
  stateFilePath: string = STATE_FILE,
  dbFilePath: string = DB_FILE,
) {
  if (!existsSync(stateFilePath)) {
    return { migrated: false, reason: 'state_file_not_found' };
  }

  const { db } = initDatabase(dbFilePath);

  const content = await readFile(stateFilePath, 'utf8');
  let parsed: StateJsonFormat;
  try {
    parsed = JSON.parse(content) as StateJsonFormat;
  } catch (error) {
    return { migrated: false, reason: 'invalid_json', error };
  }

  const persistedState = parsed.formatVersion === 1 ? parsed.persistedState : parsed;
  if (!persistedState || typeof persistedState !== 'object') {
    return { migrated: false, reason: 'invalid_persisted_state' };
  }

  const state = (persistedState.state ?? {}) as StoredState;
  const version = Number.isInteger(persistedState.version)
    ? (persistedState.version as number)
    : 42;
  const deletedConversationIds = Array.isArray(persistedState.deletedConversationIds)
    ? persistedState.deletedConversationIds
    : undefined;

  const hasVersion = db
    .select()
    .from(schema.keyValues)
    .where(sql`${schema.keyValues.key} = 'version'`)
    .get();
  const storedFieldsRow = db
    .select()
    .from(schema.keyValues)
    .where(sql`${schema.keyValues.key} = '__storedFields'`)
    .get();

  let storedFieldsSet: Set<string> | undefined;
  if (storedFieldsRow?.value) {
    try {
      storedFieldsSet = new Set(JSON.parse(storedFieldsRow.value));
    } catch {
      storedFieldsSet = undefined;
    }
  }

  const stateKeys = Object.keys(state).filter((k) => state[k] !== undefined);
  const allFieldsTracked =
    Boolean(storedFieldsSet) && stateKeys.every((k) => storedFieldsSet!.has(k));
  const dbBookCount =
    db
      .select({ count: sql<number>`count(*)` })
      .from(schema.books)
      .get()?.count ?? 0;
  const jsonBookCount = Array.isArray(state.books) ? state.books.length : 0;

  // Skip only when the DB is already initialized AND has complete field tracking
  // and book count parity with state.json. This automatically repairs any partial
  // or legacy DB state on startup so remote data is guaranteed to be in SQLite.
  if (hasVersion && allFieldsTracked && dbBookCount >= jsonBookCount) {
    return { migrated: false, reason: 'database_already_has_data' };
  }

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
    );
    return { migrated: true };
  } catch (error) {
    console.error('Migration from state.json to SQLite failed:', error);
    return { migrated: false, reason: 'transaction_failed', error };
  }
}
