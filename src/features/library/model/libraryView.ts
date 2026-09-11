import type { BookItem } from '../../../types';

export type LibraryFilter = 'all' | 'reading' | 'finished';
export type LibrarySection = 'shelf' | 'lists' | 'trash';
export type CoverTone = 'indigo' | 'amber' | 'teal';

const DAY_MS = 24 * 60 * 60 * 1_000;
const BOOK_TRASH_RETENTION_MS = 30 * DAY_MS;

export function bookCoverTone(bookId: string): CoverTone {
  const tones: CoverTone[] = ['indigo', 'amber', 'teal'];
  let hash = 0;
  for (let index = 0; index < bookId.length; index += 1) {
    hash = (hash * 31 + bookId.charCodeAt(index)) >>> 0;
  }
  return tones[hash % tones.length];
}

export function sortBooksByUpdatedAt(books: BookItem[]) {
  return [...books].sort((left, right) => right.updatedAt - left.updatedAt);
}

export function filterLibraryBooks(books: BookItem[], filter: LibraryFilter, query: string) {
  const normalized = query.trim().toLocaleLowerCase();
  return books.filter((book) => {
    if (filter === 'reading' && (book.progress <= 0 || book.progress >= 100)) return false;
    if (filter === 'finished' && book.progress < 100) return false;
    if (!normalized) return true;
    return `${book.title} ${book.author}`.toLocaleLowerCase().includes(normalized);
  });
}

export function trashDaysRemaining(deletedAt: number, now = Date.now()) {
  return Math.max(1, Math.ceil((deletedAt + BOOK_TRASH_RETENTION_MS - now) / DAY_MS));
}
