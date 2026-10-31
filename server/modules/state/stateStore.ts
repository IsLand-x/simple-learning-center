import type { BigIntStats } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import type { NoteItem } from '../../../contracts/reading.js';
import { measureServerTiming, recordServerTiming } from '../../infrastructure/http/timing.js';
import { STATE_FILE } from '../../config.js';
import { atomicWrite, exists } from '../../infrastructure/fs/files.js';
import { errorHasCode, statusError } from '../../infrastructure/http/errors.js';
import { protectBookListStateFromOlderClient } from './compatibility/olderClients.js';
import { protectChatReadState } from './compatibility/chatReadState.js';
import { protectBookTrashStateFromClient } from './compatibility/bookTrash.js';
import { hydrateStateFromDisk, prepareStateForDisk } from './serialization.js';
import type { PersistedState, StoredState } from './types.js';
import { readStateFromDb, writeStateToDb } from '../../db/sqliteStateStorage.js';

// Every state.json mutation shares this queue, including resource existence checks.
// Queue callbacks must not call readPersistedState or enqueue another mutation.
let stateWriteQueue = Promise.resolve();
type DiskState = {
  state: {
    [K in keyof StoredState]: K extends 'notes'
      ? Array<NoteItem | (Omit<NoteItem, 'content'> & { contentFile: string })>
      : StoredState[K];
  };
  version: number;
  deletedConversationIds?: string[];
};
type StateFile =
  PersistedState | { formatVersion: 1; updatedAt: string; persistedState: DiskState };
let stateReadCache: { signature: string; result: Promise<StateFile | null> } | undefined;

function fileSignature(metadata: BigIntStats) {
  return `${metadata.dev}:${metadata.ino}:${metadata.size}:${metadata.mtimeNs}:${metadata.ctimeNs}`;
}

function unwrapState(disk: StateFile | null): PersistedState | null {
  // Disk notes contain contentFile instead of content. The hydration boundary
  // below resolves those references before a note is exposed to callers.
  return disk?.formatVersion === 1
    ? (disk.persistedState as PersistedState)
    : (disk as PersistedState | null);
}

function extractNoteContents(state: StoredState): Map<string, string> | undefined {
  if (!Array.isArray(state.notes)) return undefined;
  const map = new Map<string, string>();
  for (const note of state.notes) {
    if (note && typeof note.id === 'string' && typeof note.content === 'string') {
      map.set(note.id, note.content);
    }
  }
  return map.size > 0 ? map : undefined;
}

async function readStateFile() {
  let signature: string;
  try {
    signature = fileSignature(await stat(STATE_FILE, { bigint: true }));
  } catch (error) {
    if (!errorHasCode(error, 'ENOENT')) throw error;
    stateReadCache = undefined;
    return null;
  }
  // Keep only the current file revision. Hydration projects and clones fields
  // before exposing them, so callers cannot mutate this shared parsed snapshot.
  // Inode/ctime also detect atomic replacements and same-size external edits.
  if (stateReadCache?.signature === signature) return stateReadCache.result;
  const entry = {
    signature,
    result: readFile(STATE_FILE, 'utf8').then((content) => {
      const parsed = JSON.parse(content) as StateFile;
      const unwrapped = unwrapState(parsed);
      if (unwrapped) {
        try {
          writeStateToDb(unwrapped);
        } catch {
          // Ignore DB write errors during fallback hydration
        }
      }
      return parsed;
    }),
  };
  stateReadCache = entry;
  try {
    return await entry.result;
  } catch (error) {
    if (stateReadCache === entry) stateReadCache = undefined;
    if (errorHasCode(error, 'ENOENT')) return null;
    throw error;
  }
}

async function readPersistedStateFromDisk(
  options: {
    hydrateNote?: (note: NoteItem) => boolean;
    fields?: readonly (keyof StoredState)[];
    hydrateCovers?: boolean;
  } = {},
) {
  const diskFile = await measureServerTiming('state_read', readStateFile);
  let diskState: PersistedState | null = null;
  if (options.fields && diskFile) {
    try {
      diskState = readStateFromDb(options.fields);
    } catch {
      // Fallback
    }
  }
  if (!diskState && diskFile) {
    diskState = unwrapState(diskFile);
  }
  return diskState
    ? measureServerTiming('state_hydrate', () =>
        hydrateStateFromDisk(diskState, options.hydrateNote, options.fields, options.hydrateCovers),
      )
    : null;
}

async function readResourceMetadata() {
  return structuredClone(unwrapState(await readStateFile()));
}

async function persistState(
  persistedState: PersistedState,
  currentPersistedState: PersistedState | null,
  preserveResourceFiles = false,
  fields?: readonly (keyof StoredState)[],
) {
  const nextState = protectState(persistedState, currentPersistedState);
  const noteContents = extractNoteContents(nextState.state);
  const stateForDisk = preserveResourceFiles
    ? nextState
    : await measureServerTiming('state_prepare', () => prepareStateForDisk(nextState, fields));
  await commitState(stateForDisk, true, fields, noteContents);
}

function protectState(
  persistedState: PersistedState,
  currentPersistedState: PersistedState | null,
) {
  const protectedState = currentPersistedState
    ? protectBookTrashStateFromClient(
        protectBookListStateFromOlderClient(persistedState, currentPersistedState),
        currentPersistedState,
      )
    : persistedState;
  return protectChatReadState(protectedState, currentPersistedState);
}

async function commitState(
  stateForDisk: DiskState,
  cacheOwnedSnapshot = true,
  fields?: readonly (keyof StoredState)[],
  noteContents?: ReadonlyMap<string, string>,
) {
  const envelope = {
    formatVersion: 1 as const,
    updatedAt: new Date().toISOString(),
    persistedState: stateForDisk,
  };
  const serialized = await measureServerTiming(
    'state_encode',
    () => `${JSON.stringify(envelope, null, 2)}\n`,
  );
  await measureServerTiming('state_write', () => atomicWrite(STATE_FILE, serialized));
  try {
    writeStateToDb(
      {
        version: stateForDisk.version,
        deletedConversationIds: stateForDisk.deletedConversationIds,
        state: stateForDisk.state as unknown as StoredState,
      },
      fields,
      noteContents,
    );
  } catch (dbError) {
    console.warn('SQLite 状态同步写入失败:', dbError);
  }
  if (cacheOwnedSnapshot) {
    try {
      stateReadCache = {
        signature: fileSignature(await stat(STATE_FILE, { bigint: true })),
        result: Promise.resolve(envelope),
      };
    } catch {
      stateReadCache = undefined;
    }
  } else {
    stateReadCache = undefined;
  }
}

export async function readPersistedState(options?: {
  hydrateNote?: (note: NoteItem) => boolean;
  fields?: readonly (keyof StoredState)[];
  hydrateCovers?: boolean;
  waitForWrites?: boolean;
}): Promise<PersistedState | null> {
  if (options?.waitForWrites !== false)
    await measureServerTiming('state_queue', () => stateWriteQueue.catch(() => undefined));
  return readPersistedStateFromDisk(options);
}

// Select small read models before cloning. Callbacks only inspect the cached
// snapshot; the returned value is detached before it reaches a consumer.
export async function readStateProjection<T>(
  project: (state: StoredState, version: number) => T,
  options: { waitForWrites?: boolean } = {},
): Promise<T> {
  if (options.waitForWrites !== false)
    await measureServerTiming('state_queue', () => stateWriteQueue.catch(() => undefined));
  const envelope = unwrapState(await readStateFile());
  return structuredClone(project(envelope?.state ?? {}, envelope?.version ?? 0));
}

export async function stateFileEtag() {
  try {
    const metadata = await stat(STATE_FILE, { bigint: true });
    return `W/"${metadata.size.toString(16)}-${metadata.mtimeNs.toString(16)}"`;
  } catch (error) {
    if (errorHasCode(error, 'ENOENT')) return null;
    throw error;
  }
}

export function writePersistedState(
  persistedState: PersistedState,
  initializeOnly = false,
  transform?: (
    incoming: PersistedState,
    current: PersistedState | null,
  ) => PersistedState | Promise<PersistedState>,
  options: {
    preserveResourceFiles?: boolean;
    fields?: readonly (keyof StoredState)[];
    readFields?: readonly (keyof StoredState)[];
  } = {},
) {
  const queuedAt = performance.now();
  const operation = stateWriteQueue
    .catch(() => undefined)
    .then(async () => {
      recordServerTiming('state_queue', performance.now() - queuedAt);
      if (initializeOnly && (await exists(STATE_FILE))) {
        throw statusError(409, '服务端已经包含数据');
      }
      if (options.fields) {
        const raw = unwrapState(await measureServerTiming('state_read', readStateFile));
        const current = raw
          ? await hydrateStateFromDisk(raw, undefined, options.readFields ?? options.fields, false)
          : null;
        const transformed = transform
          ? await transform(structuredClone(persistedState), current)
          : structuredClone(persistedState);
        const protectedState = protectState(transformed, current);
        // Discard fields added by compatibility rules outside this partition.
        // Dependency fields are read only (e.g. book deletion tombstones).
        const selected: StoredState = {};
        for (const field of options.fields) {
          if (Object.hasOwn(protectedState.state, field)) {
            (selected as Record<string, unknown>)[field] = (
              protectedState.state as Record<string, unknown>
            )[field];
          }
        }
        const noteContents = extractNoteContents(selected);
        const prepared = await measureServerTiming('state_prepare', () =>
          prepareStateForDisk({ ...protectedState, state: selected }, options.fields),
        );
        await commitState(
          {
            ...raw,
            version: Math.max(raw?.version ?? 0, prepared.version),
            state: { ...raw?.state, ...prepared.state },
          },
          true,
          options.fields,
          noteContents,
        );
        return;
      }
      // Preference updates cannot change books or notes. Keep their on-disk
      // metadata untouched instead of resolving every cover and Markdown file.
      const currentPersistedState = options.preserveResourceFiles
        ? await readResourceMetadata()
        : await readPersistedStateFromDisk();
      const nextState = transform
        ? await transform(structuredClone(persistedState), currentPersistedState)
        : persistedState;
      await persistState(nextState, currentPersistedState, options.preserveResourceFiles);
    });
  stateWriteQueue = operation;
  return operation;
}

export function mutatePersistedState<T>(
  mutator: (state: PersistedState) => T | Promise<T>,
  options: {
    preserveResourceFiles?: boolean;
    fields?: readonly (keyof StoredState)[];
    readOnly?: boolean;
  } = {},
): Promise<T> {
  const queuedAt = performance.now();
  const operation = stateWriteQueue
    .catch(() => undefined)
    .then(async () => {
      recordServerTiming('state_queue', performance.now() - queuedAt);
      // Metadata-only mutations keep the same atomic queue and on-disk book/note
      // references. Callers must not edit books, trashed books or notes in this mode.
      const persistedState = options.preserveResourceFiles
        ? await readResourceMetadata()
        : await readPersistedStateFromDisk();
      if (!persistedState) {
        throw statusError(409, '服务端尚未初始化，无法修改数据');
      }
      if (options.readOnly) {
        return mutator(persistedState);
      }
      const nextState = structuredClone(persistedState);
      const result = await mutator(nextState);
      await persistState(nextState, null, options.preserveResourceFiles, options.fields);
      return result;
    });
  stateWriteQueue = operation.then(
    () => undefined,
    () => undefined,
  );
  return operation;
}
