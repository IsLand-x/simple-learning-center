import type { StateStorage } from 'zustand/middleware';
import type { BookItem } from '../types';
import {
  loadLegacyBookSearchIndex,
  loadLegacyEpubFile,
  saveBookSearchIndex,
  saveEpubFile,
} from './epubStorage';
import { ServerApiError, serverRequest } from './serverApi';

const STATE_STORAGE_KEY = 'learning-center-state-v1';
const CURRENT_STATE_VERSION = 26;

export type ServerStateScope = 'shell' | 'library' | 'reader' | 'rss' | 'videos' | 'settings';

export interface ServerStateContext {
  scope: ServerStateScope;
  bookId?: string;
}

interface PersistedStateEnvelope {
  state?: Record<string, unknown> & { books?: BookItem[] };
  version?: number;
}

const RESOURCE_FIELDS = new Set(['highlights', 'notes', 'chats', 'chatSessions', 'readingSessions']);
const loadedContexts = new Map<string, ServerStateContext>();
const pendingLoads = new Map<string, Promise<boolean>>();

let prepared = false;
let preparedState: string | null = null;
let acknowledgedState: Record<string, unknown> | null = null;
let stateWriteQueue = Promise.resolve();
let persistenceActive = false;
let serverWasEmpty = false;
let requiresFullMigrationWrite = false;

function contextKey(context: ServerStateContext) {
  return context.scope === 'reader' ? `reader:${context.bookId ?? ''}` : context.scope;
}

function serializableState(state: Record<string, unknown>) {
  return JSON.parse(JSON.stringify(state)) as Record<string, unknown>;
}

function parseEnvelope(rawState: string | null): PersistedStateEnvelope | null {
  if (!rawState) return null;
  return JSON.parse(rawState) as PersistedStateEnvelope;
}

function resourceMatches(item: unknown, contexts: ServerStateContext[]) {
  const resourceId = typeof item === 'object' && item && 'bookId' in item
    ? String(item.bookId ?? '')
    : '';
  return contexts.some((context) => (
    (context.scope === 'reader' && context.bookId === resourceId)
    || (context.scope === 'rss' && resourceId.startsWith('rss:'))
    || (context.scope === 'videos' && resourceId.startsWith('video:'))
  ));
}

function mergeEntities(current: unknown, incoming: unknown, matches: (item: unknown) => boolean) {
  const currentItems = Array.isArray(current) ? current : [];
  const incomingItems = Array.isArray(incoming) ? incoming : [];
  return [...currentItems.filter((item) => !matches(item)), ...incomingItems];
}

function mergeEnvelopes(
  currentEnvelope: PersistedStateEnvelope | null,
  incomingEnvelope: PersistedStateEnvelope,
  contexts: ServerStateContext[],
) {
  if (!currentEnvelope?.state) return incomingEnvelope;
  if (!incomingEnvelope.state) return currentEnvelope;
  const state = { ...currentEnvelope.state };
  const replacesBookList = contexts.some((context) => context.scope === 'library');

  for (const [key, value] of Object.entries(incomingEnvelope.state)) {
    if (key === 'books' && !replacesBookList) {
      const currentBooks = Array.isArray(state.books) ? state.books : [];
      const incomingBooks = Array.isArray(value) ? value as BookItem[] : [];
      const incomingById = new Map(incomingBooks.map((book) => [book.id, book]));
      state.books = [
        ...currentBooks.map((book) => incomingById.get(book.id) ?? book),
        ...incomingBooks.filter((book) => !currentBooks.some((current) => current.id === book.id)),
      ];
    } else if (RESOURCE_FIELDS.has(key)) {
      state[key] = mergeEntities(state[key], value, (item) => resourceMatches(item, contexts));
    } else {
      state[key] = value;
    }
  }
  return {
    version: Math.max(currentEnvelope.version ?? 0, incomingEnvelope.version ?? 0),
    state,
  };
}

function stateRequestPath(contexts: ServerStateContext[]) {
  const params = new URLSearchParams();
  params.set('scope', [...new Set(contexts.map((context) => context.scope))].join(','));
  for (const bookId of new Set(contexts.flatMap((context) => context.bookId ? [context.bookId] : []))) {
    params.append('bookId', bookId);
  }
  return `/api/state?${params.toString()}`;
}

async function readServerState(contexts: ServerStateContext[]) {
  const response = await serverRequest(stateRequestPath(contexts));
  return response.status === 204 ? null : response.text();
}

function loadedContextList() {
  return [...loadedContexts.values()];
}

export async function refreshServerState() {
  await stateWriteQueue.catch(() => undefined);
  const contexts = loadedContextList();
  const rawState = await readServerState(contexts.length ? contexts : [{ scope: 'shell' }]);
  if (rawState) {
    const incoming = parseEnvelope(rawState)!;
    preparedState = JSON.stringify(mergeEnvelopes(parseEnvelope(preparedState), incoming, contexts));
  } else {
    preparedState = null;
  }
  prepared = true;
  return preparedState;
}

export async function ensureServerStateContext(context: ServerStateContext) {
  const key = contextKey(context);
  if (loadedContexts.has(key)) return false;
  const pending = pendingLoads.get(key);
  if (pending) {
    await pending;
    return false;
  }
  const operation = (async () => {
    await stateWriteQueue.catch(() => undefined);
    const rawState = await readServerState([context]);
    if (rawState) {
      const incoming = parseEnvelope(rawState)!;
      preparedState = JSON.stringify(mergeEnvelopes(parseEnvelope(preparedState), incoming, [context]));
    }
    loadedContexts.set(key, context);
    prepared = true;
    return true;
  })().finally(() => pendingLoads.delete(key));
  pendingLoads.set(key, operation);
  return operation;
}

export async function waitForServerStateWrites() {
  await stateWriteQueue;
}

function readLegacyBrowserState() {
  try {
    return window.localStorage.getItem(STATE_STORAGE_KEY);
  } catch {
    return null;
  }
}

function parseLegacyState(rawState: string) {
  try {
    const parsed = JSON.parse(rawState) as PersistedStateEnvelope;
    if (!parsed || typeof parsed !== 'object' || !parsed.state) throw new Error();
    return parsed;
  } catch {
    throw new Error('浏览器中的旧版学习数据格式不正确，无法自动迁移');
  }
}

async function uploadLegacyBookData(book: BookItem) {
  if (book.kind !== 'epub') return;
  const data = await loadLegacyEpubFile(book.id);
  if (data) await saveEpubFile(book.id, data);
  const index = await loadLegacyBookSearchIndex<unknown>(book.id);
  if (index) await saveBookSearchIndex(book.id, index);
}

async function initializeServerState(rawState: string) {
  try {
    await serverRequest('/api/state?initialize=1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: rawState,
    });
    return rawState;
  } catch (error) {
    if (error instanceof ServerApiError && error.status === 409) {
      return readServerState([{ scope: 'shell' }]);
    }
    throw error;
  }
}

export async function prepareServerState(onProgress?: (message: string) => void) {
  if (prepared) return preparedState;
  onProgress?.('正在连接本地数据服务…');
  const shellContext: ServerStateContext = { scope: 'shell' };
  const serverState = await readServerState([shellContext]);
  loadedContexts.set(contextKey(shellContext), shellContext);
  if (serverState) {
    const envelope = parseEnvelope(serverState);
    preparedState = serverState;
    requiresFullMigrationWrite = (envelope?.version ?? 0) < CURRENT_STATE_VERSION;
    prepared = true;
    return preparedState;
  }

  const legacyState = readLegacyBrowserState();
  if (legacyState) {
    const parsed = parseLegacyState(legacyState);
    const books = Array.isArray(parsed.state?.books) ? parsed.state.books : [];
    const epubBooks = books.filter((book) => book.kind === 'epub');
    for (let index = 0; index < epubBooks.length; index += 1) {
      onProgress?.(`正在迁移书籍文件（${index + 1}/${epubBooks.length}）…`);
      try {
        await uploadLegacyBookData(epubBooks[index]);
      } catch (error) {
        console.warn(`未能迁移《${epubBooks[index].title}》的浏览器文件`, error);
      }
    }
    onProgress?.('正在迁移笔记、进度和对话…');
    preparedState = await initializeServerState(legacyState);
    requiresFullMigrationWrite = true;
  } else {
    serverWasEmpty = true;
  }

  prepared = true;
  return preparedState;
}

function changedState(previous: Record<string, unknown>, next: Record<string, unknown>) {
  const changes: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(next)) {
    if (JSON.stringify(previous[key]) !== JSON.stringify(value)) changes[key] = value;
  }
  return changes;
}

function contextPatch(changes: Record<string, unknown>) {
  const contexts = loadedContextList();
  return {
    version: CURRENT_STATE_VERSION,
    state: changes,
    scopes: [...new Set(contexts.map((context) => context.scope))],
    bookIds: [...new Set(contexts.flatMap((context) => context.bookId ? [context.bookId] : []))],
  };
}

export async function activateServerStatePersistence(state: Record<string, unknown>) {
  const snapshot = serializableState(state);
  acknowledgedState = snapshot;
  persistenceActive = true;
  preparedState = JSON.stringify({ state: snapshot, version: CURRENT_STATE_VERSION });
  if (!serverWasEmpty && !requiresFullMigrationWrite) return;
  await serverRequest(serverWasEmpty ? '/api/state?initialize=1' : '/api/state', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state: snapshot, version: CURRENT_STATE_VERSION }),
  });
  serverWasEmpty = false;
  requiresFullMigrationWrite = false;
}

export function captureServerStateBaseline(state: Record<string, unknown>) {
  const snapshot = serializableState(state);
  acknowledgedState = snapshot;
  preparedState = JSON.stringify({ state: snapshot, version: CURRENT_STATE_VERSION });
}

export const serverStateStorage: StateStorage = {
  getItem: async () => {
    if (!prepared) await prepareServerState();
    return preparedState;
  },
  setItem: async (_name, value) => {
    if (!persistenceActive) {
      preparedState = value;
      return;
    }
    const envelope = parseEnvelope(value);
    const nextState = serializableState(envelope?.state ?? {});
    stateWriteQueue = stateWriteQueue.catch(() => undefined).then(async () => {
      const changes = changedState(acknowledgedState ?? {}, nextState);
      if (Object.keys(changes).length) {
        await serverRequest('/api/state', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(contextPatch(changes)),
        });
      }
      acknowledgedState = nextState;
      preparedState = JSON.stringify({ state: nextState, version: CURRENT_STATE_VERSION });
    });
    await stateWriteQueue;
  },
  removeItem: async () => undefined,
};
