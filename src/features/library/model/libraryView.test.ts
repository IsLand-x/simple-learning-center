import { describe, expect, it } from 'vitest';
import type { BookItem } from '../../../types';
import {
  bookCoverTone,
  filterLibraryBooks,
  sortBooksByUpdatedAt,
  trashDaysRemaining,
} from './libraryView';

function createBook(overrides: Partial<BookItem>): BookItem {
  return {
    id: 'book',
    kind: 'epub',
    title: '书名',
    author: '作者',
    fileName: 'book.epub',
    fileSize: 1_024,
    createdAt: 1,
    updatedAt: 1,
    progress: 0,
    currentChapter: '',
    toc: [],
    ...overrides,
  };
}

const books = [
  createBook({ id: 'unread', title: 'Alpha', author: '作者甲', progress: 0, updatedAt: 1 }),
  createBook({ id: 'reading', title: 'Beta', author: '作者乙', progress: 50, updatedAt: 3 }),
  createBook({ id: 'finished', title: 'Gamma', author: '作者丙', progress: 100, updatedAt: 2 }),
];

describe('library filtering', () => {
  it('keeps the source order while selecting books by progress', () => {
    expect(filterLibraryBooks(books, 'reading', '').map((book) => book.id)).toEqual(['reading']);
    expect(filterLibraryBooks(books, 'finished', '').map((book) => book.id)).toEqual(['finished']);
  });

  it('searches title and author without case sensitivity', () => {
    expect(filterLibraryBooks(books, 'all', 'alpha').map((book) => book.id)).toEqual(['unread']);
    expect(filterLibraryBooks(books, 'all', '作者乙').map((book) => book.id)).toEqual(['reading']);
  });
});

describe('library ordering', () => {
  it('sorts a copy by most recently updated without mutating the store array', () => {
    const sorted = sortBooksByUpdatedAt(books);

    expect(sorted.map((book) => book.id)).toEqual(['reading', 'finished', 'unread']);
    expect(books.map((book) => book.id)).toEqual(['unread', 'reading', 'finished']);
  });
});

describe('library presentation helpers', () => {
  it.each([
    ['a', 'amber'],
    ['b', 'teal'],
    ['c', 'indigo'],
  ] as const)('assigns %s a stable %s cover tone', (bookId, tone) => {
    expect(bookCoverTone(bookId)).toBe(tone);
  });

  it('keeps at least one displayed retention day', () => {
    const now = Date.UTC(2026, 8, 11);
    const day = 24 * 60 * 60 * 1_000;

    expect(trashDaysRemaining(now - 10 * day, now)).toBe(20);
    expect(trashDaysRemaining(now - 31 * day, now)).toBe(1);
  });
});
