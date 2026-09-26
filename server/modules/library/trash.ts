import { rm } from 'node:fs/promises';
import {
  expiredTrashedBookIds,
  moveBookToTrashInState,
  permanentlyDeleteBookInState,
  restoreBookFromTrashInState,
} from './trashState.js';
import { statusError } from '../../infrastructure/http/errors.js';
import {
  bookPath,
  knowledgeMapDirectoryPath,
  coverDirectoryPath,
  noteDirectoryPath,
  searchIndexPath,
} from '../../infrastructure/fs/files.js';
import { mutatePersistedState, readPersistedState } from '../state/repository.js';

async function removeBookFiles(bookId: string) {
  await Promise.all([
    rm(bookPath(bookId), { force: true }),
    rm(knowledgeMapDirectoryPath(bookId), { force: true, recursive: true }),
    rm(coverDirectoryPath(bookId), { force: true, recursive: true }),
    rm(searchIndexPath(bookId), { force: true }),
    rm(noteDirectoryPath(bookId), { force: true, recursive: true }),
  ]);
}

export async function movePersistedBookToTrash(bookId: string, { now = Date.now } = {}) {
  return mutatePersistedState((persistedState) => {
    const result = moveBookToTrashInState(persistedState, bookId, now());
    if (!result) throw statusError(404, '书籍不存在或已被彻底删除');
    return result;
  });
}

export async function restorePersistedBookFromTrash(bookId: string, { now = Date.now } = {}) {
  return mutatePersistedState((persistedState) => {
    const result = restoreBookFromTrashInState(persistedState, bookId, now());
    if (!result) throw statusError(404, '回收站中没有这本书');
    return result;
  });
}

export async function permanentlyDeletePersistedBook(bookId: string, { now = Date.now } = {}) {
  const deletedAt = now();
  const wasPresent = await mutatePersistedState((persistedState) =>
    permanentlyDeleteBookInState(persistedState, bookId, deletedAt),
  );
  await removeBookFiles(bookId);
  return { bookId, deletedAt, wasPresent };
}

export async function purgeExpiredTrashedBooks({ now = Date.now, logger = console } = {}) {
  const timestamp = now();
  const currentState = await readPersistedState({ hydrateNote: () => false });
  const candidateIds = expiredTrashedBookIds(currentState, timestamp);
  if (!candidateIds.length) return [];

  const deletedBookIds = await mutatePersistedState((persistedState) => {
    const expiredIds = expiredTrashedBookIds(persistedState, timestamp);
    expiredIds.forEach((bookId) => permanentlyDeleteBookInState(persistedState, bookId, timestamp));
    return expiredIds;
  });
  await Promise.all(
    deletedBookIds.map(async (bookId) => {
      try {
        await removeBookFiles(bookId);
      } catch (error) {
        logger.warn?.(
          `无法清理已过期书籍 ${bookId} 的文件：${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }),
  );
  return deletedBookIds;
}

export function createBookTrashScheduler({
  initialDelayMs = 30_000,
  intervalMs = 6 * 60 * 60 * 1_000,
  logger = console,
  now = Date.now,
} = {}) {
  let active = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const schedule = (delay: number) => {
    clearTimeout(timer);
    timer = setTimeout(() => void runCycle(), delay);
    timer.unref?.();
  };
  const runCycle = async () => {
    if (!active) return [];
    let deletedBookIds: string[] = [];
    try {
      deletedBookIds = await purgeExpiredTrashedBooks({ now, logger });
    } catch (error) {
      logger.warn?.(
        `回收站自动清理失败：${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      if (active) schedule(intervalMs);
    }
    return deletedBookIds;
  };

  return {
    start() {
      if (active) return;
      active = true;
      schedule(initialDelayMs);
    },
    stop() {
      active = false;
      clearTimeout(timer);
    },
    runCycle,
  };
}
