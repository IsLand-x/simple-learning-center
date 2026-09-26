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

async function withLegacyStore<T>(
  storeName: string,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
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

export function loadLegacyEpubFile(bookId: string) {
  return withLegacyStore<ArrayBuffer | undefined>(LEGACY_EPUB_STORE, (store) => store.get(bookId));
}

export function loadLegacyBookSearchIndex<T>(bookId: string) {
  return withLegacyStore<T | undefined>(LEGACY_BOOK_INDEX_STORE, (store) => store.get(bookId));
}
