import { Toast } from '@douyinfe/semi-ui';
import { useEffect, useMemo, useState, type RefObject } from 'react';
import { useLearningStore } from '../../../../store/useLearningStore';
import type { BookItem } from '../../../../../contracts/books';
import type { ChatMessage } from '../../../../../contracts/ai';
import type { HighlightItem } from '../../../../../contracts/reading';
import type { ReaderHighlightTarget, ReaderSelection } from '../../../../types/reader';
import { createUuid } from '../../../../util/uuid';
import type { ReaderSurfaceHandle } from '../components/ReaderSurface/type';
import { createPendingCommentHighlight } from './annotationModel';

type ReaderAnnotationsOptions = {
  book: BookItem | undefined;
  currentChapter: string;
  readerRef: RefObject<ReaderSurfaceHandle>;
  onShowHighlights: () => void;
  onOpenAssistant: () => void;
  setPanelQuote: (quote: NonNullable<ChatMessage['quote']>) => void;
};

// Kept at the reader content lifetime so switching side panels preserves a draft.
export function useReaderAnnotations({
  book,
  currentChapter,
  readerRef,
  onShowHighlights,
  onOpenAssistant,
  setPanelQuote,
}: ReaderAnnotationsOptions) {
  const bookId = book?.id;
  const allHighlights = useLearningStore((state) => state.highlights);
  const addHighlight = useLearningStore((state) => state.addHighlight);
  const updateHighlight = useLearningStore((state) => state.updateHighlight);
  const deleteHighlight = useLearningStore((state) => state.deleteHighlight);
  const [selection, setSelection] = useState<ReaderSelection | null>(null);
  const [activeHighlightTarget, setActiveHighlightTarget] = useState<ReaderHighlightTarget | null>(
    null,
  );
  const [commentingHighlightId, setCommentingHighlightId] = useState<string | null>(null);
  const [pendingCommentSelection, setPendingCommentSelection] = useState<ReaderSelection | null>(
    null,
  );
  const [commentDraft, setCommentDraft] = useState('');
  const [focusedHighlightId, setFocusedHighlightId] = useState<string | null>(null);
  const highlights = useMemo(
    () => allHighlights.filter((item) => item.bookId === bookId),
    [allHighlights, bookId],
  );
  const activeHighlight = activeHighlightTarget
    ? highlights.find((highlight) => highlight.id === activeHighlightTarget.highlightId)
    : undefined;
  useEffect(() => {
    if (!bookId) return;
    setSelection(null);
    setActiveHighlightTarget(null);
    setCommentingHighlightId(null);
    setPendingCommentSelection(null);
    setCommentDraft('');
    setFocusedHighlightId(null);
  }, [bookId]);
  useEffect(() => {
    if (!activeHighlightTarget && !pendingCommentSelection) return undefined;
    // Opening the mobile keyboard resizes the visual viewport. A comment
    // editor is intentional persistent UI, so that resize must not be treated
    // as an external interaction that closes it.
    if (pendingCommentSelection || commentingHighlightId) return undefined;
    const closeHighlightActions = () => {
      setActiveHighlightTarget(null);
      setCommentingHighlightId(null);
      setPendingCommentSelection(null);
    };
    window.addEventListener('resize', closeHighlightActions);
    document.addEventListener('scroll', closeHighlightActions, true);
    return () => {
      window.removeEventListener('resize', closeHighlightActions);
      document.removeEventListener('scroll', closeHighlightActions, true);
    };
  }, [activeHighlightTarget, commentingHighlightId, pendingCommentSelection]);

  useEffect(() => {
    if (activeHighlightTarget && !activeHighlight) {
      setActiveHighlightTarget(null);
      setCommentingHighlightId(null);
    }
  }, [activeHighlight, activeHighlightTarget]);

  const readerHighlights = useMemo<HighlightItem[]>(() => {
    if (!book || !pendingCommentSelection) return highlights;
    return [
      ...highlights,
      createPendingCommentHighlight(book, pendingCommentSelection, currentChapter),
    ];
  }, [book, currentChapter, highlights, pendingCommentSelection]);

  const saveHighlight = () => {
    if (!book || !selection) return;
    const existingHighlight = highlights.find((highlight) => highlight.cfi === selection.cfi);
    if (existingHighlight) {
      readerRef.current?.clearSelection();
      setSelection(null);
      setFocusedHighlightId(existingHighlight.id);
      setActiveHighlightTarget({ highlightId: existingHighlight.id, rect: selection.rect });
      return;
    }
    const highlightId = createUuid();
    const createdAt = Date.now();
    addHighlight({
      id: highlightId,
      bookId: book.id,
      kind: 'highlight',
      text: selection.text,
      cfi: selection.cfi,
      chapter: currentChapter,
      page: book.currentPage,
      createdAt,
      updatedAt: createdAt,
    });
    readerRef.current?.clearSelection();
    setSelection(null);
    setFocusedHighlightId(highlightId);
    setActiveHighlightTarget({ highlightId, rect: selection.rect });
    Toast.success('已添加高亮');
  };

  const showHighlightActions = (target: ReaderHighlightTarget) => {
    readerRef.current?.clearSelection();
    setSelection(null);
    setCommentingHighlightId(null);
    setPendingCommentSelection(null);
    setCommentDraft('');
    setFocusedHighlightId(target.highlightId);
    setActiveHighlightTarget(target);
  };

  const cancelHighlight = () => {
    if (!activeHighlight) return;
    deleteHighlight(activeHighlight.id);
    setActiveHighlightTarget(null);
    setCommentingHighlightId(null);
    Toast.success('已取消高亮');
  };

  const viewHighlight = () => {
    if (!activeHighlight) return;
    setFocusedHighlightId(activeHighlight.id);
    onShowHighlights();
    setActiveHighlightTarget(null);
    setCommentingHighlightId(null);
  };

  const editHighlightComment = () => {
    if (!activeHighlight) return;
    setCommentDraft(activeHighlight.comment ?? '');
    setCommentingHighlightId(activeHighlight.id);
  };

  const createCommentFromSelection = () => {
    if (!book || !selection) return;
    const existingHighlight = highlights.find((highlight) => highlight.cfi === selection.cfi);
    if (existingHighlight) {
      setFocusedHighlightId(existingHighlight.id);
      setActiveHighlightTarget({ highlightId: existingHighlight.id, rect: selection.rect });
      setCommentDraft(existingHighlight.comment ?? '');
      setCommentingHighlightId(existingHighlight.id);
      readerRef.current?.clearSelection();
      setSelection(null);
      return;
    }
    setPendingCommentSelection(selection);
    setActiveHighlightTarget(null);
    setCommentingHighlightId(null);
    setCommentDraft('');
    readerRef.current?.clearSelection();
    setSelection(null);
  };

  const cancelCommentEditing = () => {
    setPendingCommentSelection(null);
    setCommentingHighlightId(null);
    setCommentDraft('');
  };

  const saveHighlightComment = () => {
    if (!book) return;
    const comment = commentDraft.trim();
    if (pendingCommentSelection) {
      if (!comment) return;
      const createdAt = Date.now();
      addHighlight({
        id: createUuid(),
        bookId: book.id,
        kind: 'comment',
        text: pendingCommentSelection.text,
        cfi: pendingCommentSelection.cfi,
        chapter: currentChapter,
        page: book.currentPage,
        comment,
        commentUpdatedAt: createdAt,
        createdAt,
        updatedAt: createdAt,
      });
      setPendingCommentSelection(null);
      setCommentDraft('');
      Toast.success('评论已保存');
      return;
    }
    if (!activeHighlight || commentingHighlightId !== activeHighlight.id) return;
    if (!comment && activeHighlight.kind === 'comment') {
      deleteHighlight(activeHighlight.id);
    } else {
      updateHighlight(activeHighlight.id, { comment });
    }
    setCommentingHighlightId(null);
    setActiveHighlightTarget(null);
    setCommentDraft('');
    Toast.success(comment ? '评论已保存' : '评论已删除');
  };

  const askAboutSelection = () => {
    if (!book || !selection) return;
    setPanelQuote({ text: selection.text, chapter: currentChapter || '当前章节' });
    onOpenAssistant();
    readerRef.current?.clearSelection();
    setSelection(null);
  };

  const askAboutHighlight = () => {
    if (!activeHighlight) return;
    setPanelQuote({ text: activeHighlight.text, chapter: activeHighlight.chapter || '当前章节' });
    setActiveHighlightTarget(null);
    onOpenAssistant();
  };

  const jumpToHighlight = (highlight: HighlightItem) => {
    readerRef.current?.display(highlight.cfi);
  };
  function dismissActions() {
    setActiveHighlightTarget(null);
    setCommentingHighlightId(null);
    setPendingCommentSelection(null);
  }
  return {
    selection,
    setSelection,
    activeHighlightTarget,
    activeHighlight,
    commentingHighlightId,
    pendingCommentSelection,
    commentDraft,
    setCommentDraft,
    focusedHighlightId,
    readerHighlights,
    dismissActions,
    saveHighlight,
    showHighlightActions,
    cancelHighlight,
    viewHighlight,
    editHighlightComment,
    createCommentFromSelection,
    cancelCommentEditing,
    saveHighlightComment,
    askAboutSelection,
    askAboutHighlight,
    jumpToHighlight,
  };
}
