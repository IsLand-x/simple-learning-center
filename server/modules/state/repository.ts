import {
  protectRssStateFromOlderClient,
  protectVideoStateFromOlderClient,
  protectBookListStateFromOlderClient,
} from './compatibility.js';
import { protectChatReadState } from './chatReadState.js';
import { errorHasCode } from '../../infrastructure/http/errors.js';
import {
  atomicWrite,
  exists,
  coverDirectoryPath,
  notePath,
} from '../../infrastructure/fs/files.js';
import type { BookItem, NoteItem } from '../../../contracts/domain.js';
import type { PersistedState } from './types.js';
import { readFile, readdir, rm, stat } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { DATA_DIRECTORY, NOTE_DIRECTORY, STATE_FILE } from '../../config.js';
import { protectBookTrashStateFromClient } from '../library/trashState.js';
import { statusError } from '../../infrastructure/http/errors.js';

let stateWriteQueue = Promise.resolve();

function persistedStateNotes(persistedState: PersistedState | null) {
  const notes = persistedState?.state?.notes;
  return Array.isArray(notes) ? notes : [];
}

const COVER_FORMATS = new Map([
  ['image/avif', 'avif'],
  ['image/gif', 'gif'],
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/svg+xml', 'svg'],
  ['image/webp', 'webp'],
]);

function parseCoverDataUrl(value: unknown) {
  if (typeof value !== 'string') return null;
  const match = /^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/i.exec(value);
  if (!match) return null;
  const mimeType = match[1].toLowerCase();
  const extension = COVER_FORMATS.get(mimeType);
  if (!extension) return null;
  const data = Buffer.from(match[2].replaceAll(/\s/g, ''), 'base64');
  return data.length ? { data, extension } : null;
}

async function findBookCoverPath(bookId: string) {
  const directory = coverDirectoryPath(bookId);
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    const entry = entries.find(
      (candidate) =>
        candidate.isFile() && /^cover\.(?:avif|gif|jpe?g|png|svg|webp)$/i.test(candidate.name),
    );
    return entry ? join(directory, entry.name) : null;
  } catch (error) {
    if (errorHasCode(error, 'ENOENT')) return null;
    throw error;
  }
}

async function externalizeBookCover(book: BookItem) {
  if (!book || typeof book !== 'object' || typeof book.id !== 'string') return book;
  let storedCoverPath = await findBookCoverPath(book.id);
  if (!storedCoverPath) {
    const parsedCover = parseCoverDataUrl(book.coverDataUrl);
    if (parsedCover) {
      storedCoverPath = join(coverDirectoryPath(book.id), `cover.${parsedCover.extension}`);
      await atomicWrite(storedCoverPath, parsedCover.data);
    }
  }

  if (!storedCoverPath) return book;
  const { coverDataUrl: _coverDataUrl, ...metadata } = book;
  return {
    ...metadata,
    coverDataUrl: `/api/books/${encodeURIComponent(book.id)}/cover`,
  };
}

async function externalizeStateCovers(persistedState: PersistedState) {
  const state = persistedState?.state;
  if (!state) return;
  if (Array.isArray(state.books)) {
    state.books = await Promise.all(state.books.map(externalizeBookCover));
  }
  if (Array.isArray(state.trashedBooks)) {
    state.trashedBooks = await Promise.all(
      state.trashedBooks.map(async (entry) =>
        entry?.book ? { ...entry, book: await externalizeBookCover(entry.book) } : entry,
      ),
    );
  }
}

function stripStoredCoverUrls(persistedState: PersistedState) {
  const strip = (book: BookItem) => {
    if (!book || typeof book !== 'object') return book;
    if (typeof book.coverDataUrl !== 'string' || !book.coverDataUrl.startsWith('/api/books/'))
      return book;
    const { coverDataUrl: _coverDataUrl, ...metadata } = book;
    return metadata;
  };
  const state = persistedState?.state;
  if (!state) return;
  if (Array.isArray(state.books)) state.books = state.books.map(strip);
  if (Array.isArray(state.trashedBooks)) {
    state.trashedBooks = state.trashedBooks.map((entry) =>
      entry?.book ? { ...entry, book: strip(entry.book) } : entry,
    );
  }
}

export { findBookCoverPath };

async function listMarkdownFiles(directory: string): Promise<string[]> {
  if (!(await exists(directory))) return [];
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return listMarkdownFiles(path);
      return entry.isFile() && entry.name.endsWith('.md') ? [path] : [];
    }),
  );
  return nested.flat();
}

async function prepareStateForDisk(persistedState: PersistedState) {
  if (!persistedState || typeof persistedState !== 'object' || !persistedState.state) {
    throw statusError(400, '状态数据格式不正确');
  }
  const diskState = structuredClone(persistedState);
  await externalizeStateCovers(diskState);
  stripStoredCoverUrls(diskState);
  const notes = persistedStateNotes(diskState);
  const expectedNoteFiles = new Set();
  const storedNotes = [];

  for (const note of notes) {
    if (
      !note ||
      typeof note !== 'object' ||
      typeof note.id !== 'string' ||
      typeof note.bookId !== 'string'
    ) {
      continue;
    }
    const path = notePath(note.bookId, note.id);
    const content = typeof note.content === 'string' ? note.content : '';
    expectedNoteFiles.add(resolve(path));
    let existingContent;
    try {
      existingContent = await readFile(path, 'utf8');
    } catch {
      existingContent = undefined;
    }
    if (existingContent !== content) await atomicWrite(path, content);
    const { content: _content, ...metadata } = note;
    storedNotes.push({
      ...metadata,
      contentFile: relative(DATA_DIRECTORY, path).split(sep).join('/'),
    });
  }

  for (const path of await listMarkdownFiles(NOTE_DIRECTORY)) {
    if (!expectedNoteFiles.has(resolve(path))) await rm(path, { force: true });
  }

  return { ...diskState, state: { ...diskState.state, notes: storedNotes } };
}

async function hydrateStateFromDisk(
  diskState: PersistedState & { formatVersion?: number; persistedState?: PersistedState },
  hydrateNote: (note: NoteItem) => boolean = () => true,
) {
  const persistedState = diskState?.formatVersion === 1 ? diskState.persistedState : diskState;
  if (!persistedState || typeof persistedState !== 'object' || !persistedState.state) return null;
  const hydratedState = structuredClone(persistedState);
  await externalizeStateCovers(hydratedState);
  hydratedState.state.notes = await Promise.all(
    persistedStateNotes(hydratedState).map(async (note) => {
      if (!note || typeof note !== 'object') return note;
      const { contentFile, ...metadata } = note as NoteItem & { contentFile?: string };
      if (!hydrateNote(note)) return { ...metadata, content: '' };
      if (typeof contentFile !== 'string') return { ...metadata, content: note.content ?? '' };
      const path = resolve(DATA_DIRECTORY, contentFile);
      if (path !== DATA_DIRECTORY && !path.startsWith(`${DATA_DIRECTORY}${sep}`)) {
        return { ...metadata, content: '' };
      }
      try {
        return { ...metadata, content: await readFile(path, 'utf8') };
      } catch {
        return { ...metadata, content: '' };
      }
    }),
  );
  return hydratedState;
}

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
