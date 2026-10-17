import { describe, expect, it, vi } from 'vitest';
import type { View } from 'foliate-js/view.js';
import type { HighlightItem } from '../../../../../../../contracts/reading';
import { loadedAnnotations } from './termAnnotations';

const term: HighlightItem = {
  id: 'economics',
  bookId: 'book',
  kind: 'term',
  text: '经济学',
  cfi: 'original-selection',
  chapter: '一',
  createdAt: 1,
  updatedAt: 1,
};

describe('loaded term annotations', () => {
  it('keeps only the saved selection instead of scanning repeated or compound words', () => {
    const doc = document.implementation.createHTMLDocument();
    doc.body.innerHTML = '<p>经济学、经济学家、经济学，另一处经济学。</p>';
    const getContents = vi.fn(() => [{ index: 2, doc }]);
    const getCFI = vi.fn();
    const view = {
      renderer: { getContents },
      getCFI,
      resolveNavigation: (cfi: string) => (cfi === term.cfi ? { index: 2 } : undefined),
    } as unknown as View;
    expect(loadedAnnotations(view, 2, [term])).toEqual([term]);
    expect(getContents).not.toHaveBeenCalled();
    expect(getCFI).not.toHaveBeenCalled();
    expect(doc.body.innerHTML).toBe('<p>经济学、经济学家、经济学，另一处经济学。</p>');
  });

  it('does not repeat a term in another chapter and removes it when deleted', () => {
    const view = { resolveNavigation: () => ({ index: 2 }) } as unknown as View;
    expect(loadedAnnotations(view, 1, [term])).toEqual([]);
    expect(loadedAnnotations(view, 2, [])).toEqual([]);
    expect(loadedAnnotations(view, 2, [term])).toEqual([term]);
  });

  it('preserves ordinary highlights and ignores unresolved locations', () => {
    const ordinary = {
      ...term,
      id: 'ordinary',
      cfi: 'ordinary-selection',
      kind: 'highlight' as const,
    };
    const invalid = { ...term, id: 'invalid', cfi: 'unresolved' };
    const view = {
      resolveNavigation: (cfi: string) => (cfi === 'unresolved' ? undefined : { index: 2 }),
    } as unknown as View;
    expect(loadedAnnotations(view, 2, [term, ordinary, invalid])).toEqual([term, ordinary]);
  });
});
