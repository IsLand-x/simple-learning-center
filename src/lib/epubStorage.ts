const DB_NAME = 'learning-center-db';
const DB_VERSION = 1;
const EPUB_STORE = 'epub-files';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(EPUB_STORE)) {
        database.createObjectStore(EPUB_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('无法打开本地书库'));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(EPUB_STORE, mode);
    const request = operation(transaction.objectStore(EPUB_STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('本地书库操作失败'));
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => reject(transaction.error ?? new Error('本地书库事务失败'));
  });
}

export function saveEpubFile(bookId: string, data: ArrayBuffer) {
  return withStore('readwrite', (store) => store.put(data, bookId));
}

export function loadEpubFile(bookId: string) {
  return withStore<ArrayBuffer | undefined>('readonly', (store) => store.get(bookId));
}

export function removeEpubFile(bookId: string) {
  return withStore('readwrite', (store) => store.delete(bookId));
}

export async function requestPersistentStorage() {
  if (!navigator.storage?.persist) return false;
  return navigator.storage.persist();
}
