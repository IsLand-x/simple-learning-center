const DB_NAME = 'learning-center-db';
const DB_VERSION = 2;
const EPUB_STORE = 'epub-files';
const BOOK_INDEX_STORE = 'book-search-indexes';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(EPUB_STORE)) {
        database.createObjectStore(EPUB_STORE);
      }
      if (!database.objectStoreNames.contains(BOOK_INDEX_STORE)) {
        database.createObjectStore(BOOK_INDEX_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('无法打开本地书库'));
  });
}

async function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, mode);
    const request = operation(transaction.objectStore(storeName));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('本地书库操作失败'));
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => reject(transaction.error ?? new Error('本地书库事务失败'));
  });
}

export function saveEpubFile(bookId: string, data: ArrayBuffer) {
  return withStore(EPUB_STORE, 'readwrite', (store) => store.put(data, bookId));
}

export function loadEpubFile(bookId: string) {
  return withStore<ArrayBuffer | undefined>(EPUB_STORE, 'readonly', (store) => store.get(bookId));
}

export async function removeEpubFile(bookId: string) {
  await Promise.all([
    withStore(EPUB_STORE, 'readwrite', (store) => store.delete(bookId)),
    withStore(BOOK_INDEX_STORE, 'readwrite', (store) => store.delete(bookId)),
  ]);
}

export function saveBookSearchIndex(bookId: string, index: unknown) {
  return withStore(BOOK_INDEX_STORE, 'readwrite', (store) => store.put(index, bookId));
}

export function loadBookSearchIndex<T>(bookId: string) {
  return withStore<T | undefined>(BOOK_INDEX_STORE, 'readonly', (store) => store.get(bookId));
}

export async function requestPersistentStorage() {
  if (!navigator.storage?.persist) return false;
  return navigator.storage.persist();
}
