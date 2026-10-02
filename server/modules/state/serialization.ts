import { readFile, readdir, rm } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import type { BookItem } from '../../../contracts/books.js';
import type { NoteItem } from '../../../contracts/reading.js';
import { DATA_DIRECTORY, NOTE_DIRECTORY } from '../../config.js';
import {
  atomicWrite,
  exists,
  coverDirectoryPath,
  findBookCoverPath,
  notePath,
} from '../../infrastructure/fs/files.js';
import { statusError } from '../../infrastructure/http/errors.js';
import type { PersistedState } from './types.js';

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

export async function prepareStateForDisk(persistedState: PersistedState) {
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

export async function hydrateStateFromDisk(
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
