import type { BookItem } from '../types';
import { loadEpubFile } from './epubStorage';

const pendingCoverRecoveries = new Map<string, Promise<string | undefined>>();

export function recoverMissingBookCover(book: BookItem) {
  if (book.kind !== 'epub' || typeof book.coverDataUrl === 'string') {
    return Promise.resolve(book.coverDataUrl);
  }
  const pending = pendingCoverRecoveries.get(book.id);
  if (pending) return pending;
  const operation = (async () => {
    try {
      const { readEpubCover } = await import('./parseEpub');
      const data = await loadEpubFile(book.id);
      if (!data) return '';
      return await readEpubCover(data) ?? '';
    } catch (error) {
      console.warn(`未能恢复《${book.title}》的封面`, error);
      return undefined;
    } finally {
      pendingCoverRecoveries.delete(book.id);
    }
  })();
  pendingCoverRecoveries.set(book.id, operation);
  return operation;
}
