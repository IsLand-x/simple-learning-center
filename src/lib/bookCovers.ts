import type { BookItem } from '../types';
import { loadEpubFile } from './epubStorage';

export async function recoverMissingBookCovers(
  books: BookItem[],
  onProgress?: (current: number, total: number) => void,
) {
  const missingCovers = books.filter((book) => (
    book.kind === 'epub' && typeof book.coverDataUrl !== 'string'
  ));
  const covers: Record<string, string> = {};
  if (!missingCovers.length) return covers;
  const { readEpubCover } = await import('./parseEpub');

  for (let index = 0; index < missingCovers.length; index += 1) {
    const book = missingCovers[index];
    onProgress?.(index + 1, missingCovers.length);
    try {
      const data = await loadEpubFile(book.id);
      if (!data) continue;
      covers[book.id] = await readEpubCover(data) ?? '';
    } catch (error) {
      console.warn(`未能恢复《${book.title}》的封面`, error);
    }
  }

  return covers;
}
