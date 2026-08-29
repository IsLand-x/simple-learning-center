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

interface PersistedStateEnvelope {
  state?: {
    books?: BookItem[];
  };
  version?: number;
}

let prepared = false;
let preparedState: string | null = null;
let stateWriteQueue = Promise.resolve();

async function readServerState() {
  const response = await serverRequest('/api/state');
  return response.status === 204 ? null : response.text();
}

export async function refreshServerState() {
  await stateWriteQueue.catch(() => undefined);
  preparedState = await readServerState();
  prepared = true;
  return preparedState;
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
    if (error instanceof ServerApiError && error.status === 409) return readServerState();
    throw error;
  }
}

export async function prepareServerState(onProgress?: (message: string) => void) {
  if (prepared) return preparedState;
  onProgress?.('正在连接本地数据服务…');
  const serverState = await readServerState();
  if (serverState) {
    preparedState = serverState;
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
  }

  prepared = true;
  return preparedState;
}

export const serverStateStorage: StateStorage = {
  getItem: async () => {
    if (!prepared) await prepareServerState();
    return preparedState;
  },
  setItem: async (_name, value) => {
    preparedState = value;
    stateWriteQueue = stateWriteQueue.catch(() => undefined).then(async () => {
      await serverRequest('/api/state', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: value,
      });
    });
    await stateWriteQueue;
  },
  removeItem: async () => undefined,
};
