import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import type { HighlightItem } from '../../../../../../../contracts/reading';
import { DemoHighlightedText } from './DemoHighlightedText';

describe('demo term origin', () => {
  it('marks only the selected occurrence, including when a compound word occurs earlier', () => {
    const text = '经济学家研究经济学，读者再次选择经济学';
    const start = text.lastIndexOf('经济学');
    const term: HighlightItem = {
      id: 'term',
      bookId: 'demo',
      kind: 'term',
      text: '经济学',
      cfi: `demo:chapter-1:selection:0:${start}`,
      chapter: '一',
      createdAt: 1,
      updatedAt: 1,
    };
    const container = document.createElement('div');
    const root = createRoot(container);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const render = (paragraphIndex: number) =>
      act(() =>
        root.render(
          createElement(DemoHighlightedText, {
            text,
            paragraphIndex,
            highlights: [term],
            onHighlightClick: vi.fn(),
          }),
        ),
      );
    try {
      render(0);
      const marks = container.querySelectorAll('.reader-inline-term');
      expect(marks).toHaveLength(1);
      expect(marks[0].textContent).toBe('经济学');
      expect(container.firstChild?.textContent).toBe(text.slice(0, start));
      expect(container.textContent).toBe(text);
      render(1);
      expect(container.querySelectorAll('.reader-inline-term')).toHaveLength(0);
      expect(container.textContent).toBe(text);
    } finally {
      act(() => root.unmount());
      vi.unstubAllGlobals();
    }
  });
});
