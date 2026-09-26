import type { RefObject, Dispatch, SetStateAction } from 'react';
import { Toast } from '@douyinfe/semi-ui';
import type { MobileReaderPanel } from '../components/ReaderRightSidebar';
import type { ReaderSurfaceHandle } from '../components/ReaderSurface';
import { createUuid } from '../../../../util/uuid';
import type { LearningState } from '../../../../util/state/learningState';
import type {
  BookItem,
  ChatMessage,
  HighlightItem,
  ReaderHighlightTarget,
  ReaderSelection,
} from '../../../../util/types';

type ReaderAnnotationActionOptions = Pick<
  LearningState,
  'addHighlight' | 'deleteHighlight' | 'updateHighlight'
> & {
  book: BookItem;
  selection: ReaderSelection | null;
  highlights: HighlightItem[];
  activeHighlight: HighlightItem | undefined;
  commentDraft: string;
  pendingCommentSelection: ReaderSelection | null;
  commentingHighlightId: string | null;
  currentChapter: string;
  readerRef: RefObject<ReaderSurfaceHandle>;
  setSelection: Dispatch<SetStateAction<ReaderSelection | null>>;
  setFocusedHighlightId: Dispatch<SetStateAction<string | null>>;
  setActiveHighlightTarget: Dispatch<SetStateAction<ReaderHighlightTarget | null>>;
  setCommentingHighlightId: Dispatch<SetStateAction<string | null>>;
  setPendingCommentSelection: Dispatch<SetStateAction<ReaderSelection | null>>;
  setCommentDraft: Dispatch<SetStateAction<string>>;
  setActivePanel: Dispatch<SetStateAction<MobileReaderPanel | null>>;
  setPanelQuote: Dispatch<SetStateAction<NonNullable<ChatMessage['quote']> | null>>;
  changeActivePanel: (panel: MobileReaderPanel | null) => void;
};

// Uses the page's transient state and the single persisted learning store.
export function createReaderAnnotationActions({
  book,
  selection,
  highlights,
  activeHighlight,
  commentDraft,
  pendingCommentSelection,
  commentingHighlightId,
  currentChapter,
  readerRef,
  addHighlight,
  deleteHighlight,
  updateHighlight,
  setSelection,
  setFocusedHighlightId,
  setActiveHighlightTarget,
  setCommentingHighlightId,
  setPendingCommentSelection,
  setCommentDraft,
  setActivePanel,
  setPanelQuote,
  changeActivePanel,
}: ReaderAnnotationActionOptions) {
  const saveHighlight = () => {
    if (!selection) return;
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
    setActivePanel('highlights');
    setActiveHighlightTarget(null);
    setCommentingHighlightId(null);
  };

  const editHighlightComment = () => {
    if (!activeHighlight) return;
    setCommentDraft(activeHighlight.comment ?? '');
    setCommentingHighlightId(activeHighlight.id);
  };

  const createCommentFromSelection = () => {
    if (!selection) return;
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
    if (!selection) return;
    setPanelQuote({ text: selection.text, chapter: currentChapter || '当前章节' });
    changeActivePanel('ai');
    readerRef.current?.clearSelection();
    setSelection(null);
  };

  const askAboutHighlight = () => {
    if (!activeHighlight) return;
    setPanelQuote({ text: activeHighlight.text, chapter: activeHighlight.chapter || '当前章节' });
    setActiveHighlightTarget(null);
    changeActivePanel('ai');
  };

  const jumpToHighlight = (highlight: HighlightItem) => {
    readerRef.current?.display(highlight.cfi);
  };
  return {
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
