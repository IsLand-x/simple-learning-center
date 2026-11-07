import { describe, expect, it } from 'vitest';
import type { BookItem } from '../../../contracts/books';
import { mergeLibraryBooks } from './libraryStateMerge';

function book(progress: number, updatedAt: number): BookItem {
  return {
    id: 'book',
    kind: 'epub',
    title: '书',
    author: '',
    fileName: '',
    fileSize: 1,
    createdAt: 1,
    updatedAt,
    progress,
    currentCfi: `cfi-${progress}`,
    currentChapter: '章',
    toc: [],
  };
}

describe('mergeLibraryBooks', () => {
  it('keeps the newer reading location and does not drop a book that exists on only one side', () => {
    const merged = mergeLibraryBooks(
      [book(40, 20), { ...book(1, 5), id: 'remote-only' }],
      [book(10, 30), { ...book(2, 4), id: 'local-only' }],
    );
    expect(merged.map((item) => [item.id, item.progress])).toEqual([
      ['book', 10],
      ['remote-only', 1],
      ['local-only', 2],
    ]);
  });

  it('keeps a newer reading location when a rename only refreshes the book clock', () => {
    const remote = { ...book(80, 40), locationUpdatedAt: 40, title: '旧名' };
    const local = { ...book(5, 100), locationUpdatedAt: 5, title: '新名' };
    const [merged] = mergeLibraryBooks([remote], [local]);
    expect(merged.title).toBe('新名');
    expect(merged.progress).toBe(80);
    expect(merged.currentCfi).toBe('cfi-80');
    expect(merged.locationUpdatedAt).toBe(40);
  });

  it('lets two legacy snapshots keep using the book clock', () => {
    const [merged] = mergeLibraryBooks([book(80, 40)], [book(5, 100)]);
    expect(merged.progress).toBe(5);
    expect(merged.locationUpdatedAt).toBeUndefined();
  });

  it('does not let an older progress snapshot undo a newer archive decision', () => {
    const remote = { ...book(50, 40), archiveUpdatedAt: 10, archivedAt: 10 };
    const local = { ...book(5, 30), archiveUpdatedAt: 35 };
    const [merged] = mergeLibraryBooks([remote], [local]);
    expect(merged.progress).toBe(50);
    expect(merged.archivedAt).toBeUndefined();
    expect(merged.archiveUpdatedAt).toBe(35);
  });
});
