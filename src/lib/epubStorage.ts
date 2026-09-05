import { serverRequest } from './serverApi';
import type { TrashedBookItem } from '../types';

const LEGACY_DB_NAME = 'learning-center-db';
const LEGACY_DB_VERSION = 2;
const LEGACY_EPUB_STORE = 'epub-files';
const LEGACY_BOOK_INDEX_STORE = 'book-search-indexes';

function openLegacyDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(LEGACY_DB_NAME, LEGACY_DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(LEGACY_EPUB_STORE)) {
        database.createObjectStore(LEGACY_EPUB_STORE);
      }
      if (!database.objectStoreNames.contains(LEGACY_BOOK_INDEX_STORE)) {
        database.createObjectStore(LEGACY_BOOK_INDEX_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('无法打开旧版浏览器书库'));
  });
}

async function withLegacyStore<T>(storeName: string, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await openLegacyDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readonly');
    const request = operation(transaction.objectStore(storeName));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('读取旧版浏览器数据失败'));
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => reject(transaction.error ?? new Error('读取旧版浏览器数据失败'));
  });
}

export async function saveEpubFile(bookId: string, data: ArrayBuffer) {
  await serverRequest(`/api/books/${encodeURIComponent(bookId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/epub+zip' },
    body: data,
  });
}

export async function loadEpubFile(bookId: string) {
  const response = await fetch(`/api/books/${encodeURIComponent(bookId)}`, {
    cache: 'no-store',
    credentials: 'same-origin',
  });
  if (response.status === 404) return undefined;
  if (!response.ok) {
    let message = `读取书籍文件失败（${response.status}）`;
    try {
      const payload = await response.json() as { error?: unknown };
      if (typeof payload.error === 'string') message = payload.error;
    } catch {
      // Keep the status-based message.
    }
    throw new Error(message);
  }
  return response.arrayBuffer();
}

export async function moveBookToTrash(bookId: string) {
  const response = await serverRequest(`/api/books/${encodeURIComponent(bookId)}/trash`, { method: 'POST' });
  return response.json() as Promise<TrashedBookItem>;
}

export async function restoreBookFromTrash(bookId: string) {
  const response = await serverRequest(`/api/books/${encodeURIComponent(bookId)}/restore`, { method: 'POST' });
  return response.json() as Promise<TrashedBookItem>;
}

export async function permanentlyDeleteBook(bookId: string) {
  const response = await serverRequest(`/api/books/${encodeURIComponent(bookId)}`, { method: 'DELETE' });
  return response.json() as Promise<{ bookId: string; deletedAt: number; wasPresent: boolean }>;
}

export async function saveBookSearchIndex(bookId: string, index: unknown) {
  await serverRequest(`/api/search-indexes/${encodeURIComponent(bookId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(index),
  });
}

export async function loadBookSearchIndex<T>(bookId: string) {
  const response = await fetch(`/api/search-indexes/${encodeURIComponent(bookId)}`, {
    cache: 'no-store',
    credentials: 'same-origin',
  });
  if (response.status === 404) return undefined;
  if (!response.ok) throw new Error(`读取书内搜索索引失败（${response.status}）`);
  return response.json() as Promise<T>;
}

export function loadLegacyEpubFile(bookId: string) {
  return withLegacyStore<ArrayBuffer | undefined>(LEGACY_EPUB_STORE, (store) => store.get(bookId));
}

export function loadLegacyBookSearchIndex<T>(bookId: string) {
  return withLegacyStore<T | undefined>(LEGACY_BOOK_INDEX_STORE, (store) => store.get(bookId));
}
