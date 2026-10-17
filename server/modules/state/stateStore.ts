import { readFile, stat } from 'node:fs/promises';
import type { NoteItem } from '../../../contracts/reading.js';
import { STATE_FILE } from '../../config.js';
import { atomicWrite, exists } from '../../infrastructure/fs/files.js';
import { errorHasCode, statusError } from '../../infrastructure/http/errors.js';
import {
  protectRssStateFromOlderClient,
  protectVideoStateFromOlderClient,
  protectBookListStateFromOlderClient,
} from './compatibility/olderClients.js';
import { protectChatReadState } from './compatibility/chatReadState.js';
import { protectBookTrashStateFromClient } from './compatibility/bookTrash.js';
import { hydrateStateFromDisk, prepareStateForDisk } from './serialization.js';
import type { PersistedState, StoredState } from './types.js';

// Every state.json mutation shares this queue, including resource existence checks.
// Queue callbacks must not call readPersistedState or enqueue another mutation.
let stateWriteQueue = Promise.resolve();
let stateReadCache: { signature: string; result: Promise<PersistedState | null> } | undefined;

async function readStateFile() {
  let signature: string;
  try {
    const metadata = await stat(STATE_FILE, { bigint: true });
    signature = `${metadata.dev}:${metadata.ino}:${metadata.size}:${metadata.mtimeNs}:${metadata.ctimeNs}`;
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
    result: readFile(STATE_FILE, 'utf8').then((content) => JSON.parse(content) as PersistedState),
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
  } = {},
) {
  const diskState = await readStateFile();
  return diskState ? hydrateStateFromDisk(diskState, options.hydrateNote, options.fields) : null;
}

async function persistState(
  persistedState: PersistedState,
  currentPersistedState: PersistedState | null,
) {
  const protectedState = currentPersistedState
    ? protectBookTrashStateFromClient(
        protectBookListStateFromOlderClient(
          protectVideoStateFromOlderClient(
            protectRssStateFromOlderClient(persistedState, currentPersistedState),
            currentPersistedState,
          ),
          currentPersistedState,
        ),
        currentPersistedState,
      )
    : persistedState;
  const stateForDisk = await prepareStateForDisk(
    protectChatReadState(protectedState, currentPersistedState),
  );
  await atomicWrite(
    STATE_FILE,
    `${JSON.stringify(
      {
        formatVersion: 1,
        updatedAt: new Date().toISOString(),
        persistedState: stateForDisk,
      },
      null,
      2,
    )}\n`,
  );
}

export async function readPersistedState(options?: {
  hydrateNote?: (note: NoteItem) => boolean;
  fields?: readonly (keyof StoredState)[];
}): Promise<PersistedState | null> {
  await stateWriteQueue.catch(() => undefined);
  return readPersistedStateFromDisk(options);
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
) {
  const operation = stateWriteQueue
    .catch(() => undefined)
    .then(async () => {
      if (initializeOnly && (await exists(STATE_FILE))) {
        throw statusError(409, '服务端已经包含数据');
      }
      const currentPersistedState = await readPersistedStateFromDisk();
      const nextState = transform
        ? await transform(structuredClone(persistedState), currentPersistedState)
        : persistedState;
      await persistState(nextState, currentPersistedState);
    });
  stateWriteQueue = operation;
  return operation;
}

export function mutatePersistedState<T>(
  mutator: (state: PersistedState) => T | Promise<T>,
): Promise<T> {
  const operation = stateWriteQueue
    .catch(() => undefined)
    .then(async () => {
      const persistedState = await readPersistedStateFromDisk();
      if (!persistedState) {
        throw statusError(409, '服务端尚未初始化，无法修改数据');
      }
      const nextState = structuredClone(persistedState);
      const result = await mutator(nextState);
      await persistState(nextState, null);
      return result;
    });
  stateWriteQueue = operation.then(
    () => undefined,
    () => undefined,
  );
  return operation;
}
