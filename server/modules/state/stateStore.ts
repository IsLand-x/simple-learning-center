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
import type { PersistedState } from './types.js';

// Every state.json mutation shares this queue, including resource existence checks.
// Queue callbacks must not call readPersistedState or enqueue another mutation.
let stateWriteQueue = Promise.resolve();

async function readPersistedStateFromDisk(
  options: { hydrateNote?: (note: NoteItem) => boolean } = {},
) {
  try {
    const diskState = JSON.parse(await readFile(STATE_FILE, 'utf8'));
    return hydrateStateFromDisk(diskState, options.hydrateNote);
  } catch (error) {
    if (errorHasCode(error, 'ENOENT')) return null;
    throw error;
  }
}

async function persistState(persistedState: PersistedState, protectClientSnapshot = true) {
  const currentPersistedState = protectClientSnapshot ? await readPersistedStateFromDisk() : null;
  const protectedState = protectClientSnapshot
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
      const currentPersistedState = transform ? await readPersistedStateFromDisk() : null;
      const nextState = transform
        ? await transform(structuredClone(persistedState), currentPersistedState)
        : persistedState;
      await persistState(nextState, true);
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
      await persistState(nextState, false);
      return result;
    });
  stateWriteQueue = operation.then(
    () => undefined,
    () => undefined,
  );
  return operation;
}
