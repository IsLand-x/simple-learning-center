import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BookItem } from '../../../../../contracts/books';
import type { HighlightItem } from '../../../../../contracts/reading';
import type { ReaderSelection } from '../../../../types/reader';
import { useReaderAnnotations } from './useReaderAnnotations';

const state = vi.hoisted(() => ({
  highlights: [] as HighlightItem[],
  addHighlight: vi.fn(),
  updateHighlight: vi.fn(),
  deleteHighlight: vi.fn(),
}));
vi.mock('../../../../store/useLearningStore', () => ({
  useLearningStore: (selector: (value: typeof state) => unknown) => selector(state),
}));
vi.mock('@douyinfe/semi-ui', () => ({ Toast: { success: vi.fn() } }));

const initialBook: BookItem = {
  id: 'annotation-book',
  kind: 'demo',
  title: '标注测试',
  author: '测试',
  fileName: '',
  fileSize: 0,
  createdAt: 1,
  updatedAt: 1,
  progress: 0,
  currentChapter: '第一章',
  currentPage: 1,
  toc: [{ id: 'chapter-1', label: '第一章', href: 'chapter-1' }],
};
const selection: ReaderSelection = {
  text: '原创标注测试文字',
  cfi: 'epubcfi(/6/2!/4/2:0)',
  rect: { left: 10, top: 20, width: 40, height: 20 },
};

describe('reader annotation state ownership', () => {
  let root: ReturnType<typeof createRoot>;
  let container: HTMLDivElement;
  let annotations: ReturnType<typeof useReaderAnnotations>;
  const readerRef = {
    current: {
      next: vi.fn(),
      prev: vi.fn(),
      display: vi.fn(),
      clearSelection: vi.fn(),
      getCurrentText: () => '',
    },
  };
  const onShowHighlights = vi.fn();
  const onOpenAssistant = vi.fn();
  const setPanelQuote = vi.fn();
  function Reader({ book = initialBook }: { book?: BookItem }) {
    annotations = useReaderAnnotations({
      book,
      currentChapter: book.currentChapter,
      readerRef,
      onShowHighlights,
      onOpenAssistant,
      setPanelQuote,
    });
    return null;
  }
  beforeEach(() => {
    vi.clearAllMocks();
    state.highlights = [];
    state.addHighlight.mockImplementation((highlight: HighlightItem) => {
      state.highlights = [...state.highlights, highlight];
    });
    state.deleteHighlight.mockImplementation((id: string) => {
      state.highlights = state.highlights.filter((item) => item.id !== id);
    });
    state.updateHighlight.mockImplementation((id: string, changes: Partial<HighlightItem>) => {
      state.highlights = state.highlights.map((item) =>
        item.id === id ? { ...item, ...changes } : item,
      );
    });
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    act(() => root.render(<Reader />));
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('keeps a pending comment marker and draft through progress updates and keyboard resize, then resets on another book', () => {
    act(() => annotations.setSelection(selection));
    act(() => annotations.createCommentFromSelection());
    act(() => annotations.setCommentDraft('保留这段见解'));
    act(() => root.render(<Reader book={{ ...initialBook, progress: 25, currentPage: 2 }} />));
    act(() => window.dispatchEvent(new Event('resize')));
    expect(annotations.commentDraft).toBe('保留这段见解');
    expect(annotations.pendingCommentSelection).toEqual(selection);
    expect(annotations.readerHighlights).toEqual([
      expect.objectContaining({
        id: 'pending-comment-highlight',
        kind: 'comment',
        cfi: selection.cfi,
      }),
    ]);
    act(() => root.render(<Reader book={{ ...initialBook, id: 'another-book' }} />));
    expect(annotations.commentDraft).toBe('');
    expect(annotations.pendingCommentSelection).toBeNull();
    expect(annotations.readerHighlights).toEqual([]);
  });

  it('persists a new comment at its exact CFI and removes a comment-only marker when its comment is deleted', () => {
    act(() => annotations.setSelection(selection));
    act(() => annotations.createCommentFromSelection());
    act(() => annotations.setCommentDraft('  已保存的评论  '));
    act(() => annotations.saveHighlightComment());
    const highlight = state.highlights[0];
    expect(highlight).toMatchObject({
      bookId: initialBook.id,
      kind: 'comment',
      cfi: selection.cfi,
      comment: '已保存的评论',
      chapter: initialBook.currentChapter,
    });
    expect(annotations.pendingCommentSelection).toBeNull();
    act(() =>
      annotations.showHighlightActions({ highlightId: highlight.id, rect: selection.rect }),
    );
    act(() => annotations.editHighlightComment());
    act(() => annotations.setCommentDraft(''));
    act(() => annotations.saveHighlightComment());
    expect(state.deleteHighlight).toHaveBeenCalledWith(highlight.id);
    expect(state.highlights).toEqual([]);
    expect(annotations.activeHighlightTarget).toBeNull();
  });

  it('reuses an existing highlight and preserves it when its ordinary comment is removed', () => {
    act(() => annotations.setSelection(selection));
    act(() => annotations.saveHighlight());
    const highlight = state.highlights[0];
    act(() => annotations.setSelection(selection));
    act(() => annotations.saveHighlight());
    expect(state.addHighlight).toHaveBeenCalledTimes(1);
    expect(annotations.activeHighlight?.id).toBe(highlight.id);
    act(() => annotations.editHighlightComment());
    act(() => annotations.setCommentDraft(''));
    act(() => annotations.saveHighlightComment());
    expect(state.deleteHighlight).not.toHaveBeenCalled();
    expect(state.updateHighlight).toHaveBeenCalledWith(highlight.id, { comment: '' });
  });

  it('clears action overlays on panel changes while forwarding selected text as a separate AI quote', () => {
    act(() => annotations.setSelection(selection));
    act(() => annotations.askAboutSelection());
    expect(setPanelQuote).toHaveBeenCalledWith({
      text: selection.text,
      chapter: initialBook.currentChapter,
    });
    expect(onOpenAssistant).toHaveBeenCalledOnce();
    expect(readerRef.current.clearSelection).toHaveBeenCalled();
    expect(annotations.selection).toBeNull();
    act(() => annotations.setSelection(selection));
    act(() => annotations.createCommentFromSelection());
    act(() => annotations.dismissActions());
    expect(annotations.pendingCommentSelection).toBeNull();
  });
});
