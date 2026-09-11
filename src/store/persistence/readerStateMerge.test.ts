import { describe, expect, it } from 'vitest';
import type { HighlightItem } from '../../types';
import { defaultReaderPreferences } from '../defaults';
import { mergeReaderHighlights, mergeReaderPreferences } from './readerStateMerge';

function highlight(id: string, updatedAt: number): HighlightItem {
  return {
    id,
    bookId: 'book-1',
    text: id,
    cfi: `epubcfi(${id})`,
    chapter: '第一章',
    createdAt: 1,
    updatedAt,
  };
}

describe('reader state merge', () => {
  it('keeps the newest version of a highlight from either snapshot', () => {
    const result = mergeReaderHighlights(
      { highlights: [highlight('same', 5), highlight('remote', 3)] },
      { highlights: [highlight('same', 8), highlight('local', 4)] },
    );

    expect(result.highlights.map((item) => [item.id, item.updatedAt])).toEqual([
      ['same', 8],
      ['local', 4],
      ['remote', 3],
    ]);
  });

  it('uses a deletion tombstone only when it is newer than the highlight', () => {
    const deleted = mergeReaderHighlights(
      { deletedHighlightTombstones: [{ highlightId: 'same', bookId: 'book-1', deletedAt: 9 }] },
      { highlights: [highlight('same', 8)] },
    );
    expect(deleted.highlights).toEqual([]);

    const restored = mergeReaderHighlights(
      { deletedHighlightTombstones: [{ highlightId: 'same', bookId: 'book-1', deletedAt: 7 }] },
      { highlights: [highlight('same', 8)] },
    );
    expect(restored.highlights).toHaveLength(1);
  });

  it('merges style and layout by their independent timestamps', () => {
    const result = mergeReaderPreferences(
      {
        readerPreferences: {
          ...defaultReaderPreferences,
          fontSize: 24,
          tocWidth: 220,
        },
        readerStyleUpdatedAt: 20,
        readerLayoutUpdatedAt: 5,
      },
      {
        readerPreferences: {
          ...defaultReaderPreferences,
          fontSize: 16,
          tocWidth: 360,
        },
        readerStyleUpdatedAt: 10,
        readerLayoutUpdatedAt: 30,
      },
    );

    expect(result.readerPreferences.fontSize).toBe(24);
    expect(result.readerPreferences.tocWidth).toBe(360);
    expect(result.readerPreferencesUpdatedAt).toBe(30);
  });
});
