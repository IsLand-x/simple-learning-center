import { booksApi } from '../../../../api/books';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Toast } from '@douyinfe/semi-ui';
import { IconAlertTriangle } from '@douyinfe/semi-icons';
import { useNavigate, useParams } from 'react-router-dom';
import type { MobileReaderPanel } from './model/rightPanelModel';
import type { ReaderLocationUpdate, ReaderSurfaceHandle } from './model/readerSurfaceTypes';
import { useReaderAiActivity } from './hooks/useReaderAiActivity';
import { useDeferredBookLocation } from './hooks/useDeferredBookLocation';
import { useMobileReaderOverlay } from './hooks/useMobileReaderOverlay';
import { useReaderResponsiveLayout } from './hooks/useReaderResponsiveLayout';
import { useReadingSession } from './hooks/useReadingSession';
import { createPendingCommentHighlight } from './model/readerPageModel';
import { findChapterLabel, isReaderKeyboardEditingTarget } from './model/readerSurfaceModel';
import { confirmDialog } from '../../../../util/confirmDialog';

import { createUuid } from '../../../../util/uuid';
import { useLearningStore } from '../../../../util/state/useLearningStore';
import type {
  BookItem,
  ChatMessage,
  HighlightItem,
  ReaderHighlightTarget,
  ReaderSelection,
  TocItem,
} from '../../../../types/domain';
import { createReaderAnnotationActions } from './readerAnnotationActions';
import { createReaderConversationActions } from './readerConversationActions';

export function useReaderPageStore() {
  const { bookId = '' } = useParams();
  const aiActivity = useReaderAiActivity();
  const navigate = useNavigate();
  const book = useLearningStore((state) => state.books.find((item) => item.id === bookId));
  const allHighlights = useLearningStore((state) => state.highlights);
  const updateBook = useLearningStore((state) => state.updateBook);
  const trashBook = useLearningStore((state) => state.trashBook);
  const addHighlight = useLearningStore((state) => state.addHighlight);
  const updateHighlight = useLearningStore((state) => state.updateHighlight);
  const deleteHighlight = useLearningStore((state) => state.deleteHighlight);
  const themeMode = useLearningStore((state) => state.themeMode);
  const preferences = useLearningStore((state) => state.readerPreferences);
  const setPreferences = useLearningStore((state) => state.setReaderPreferences);
  const upsertReadingSession = useLearningStore((state) => state.upsertReadingSession);
  const openAIConfigs = useLearningStore((state) => state.openAIConfigs);
  const aiPreferences = useLearningStore((state) => state.aiPreferences);
  const setAiPreferences = useLearningStore((state) => state.setAiPreferences);
  const readerRef = useRef<ReaderSurfaceHandle>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const recordPageChangeRef = useRef<((page?: number, href?: string, cfi?: string) => void) | null>(
    null,
  );
  const [activePanel, setActivePanel] = useState<MobileReaderPanel | null>(null);
  const [mobileChromeVisible, setMobileChromeVisible] = useState(true);
  const [compactTocOpen, setCompactTocOpen] = useState(false);
  const [conversationId, setConversationId] = useState<string>(() => createUuid());
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
  const [panelQuote, setPanelQuote] = useState<NonNullable<ChatMessage['quote']> | null>(null);
  const [stylePopoverVisible, setStylePopoverVisible] = useState(false);
  const [returnCfi, setReturnCfi] = useState<string | null>(null);
  const [activeHref, setActiveHref] = useState(book?.toc[0]?.href);
  const highlights = useMemo(
    () => allHighlights.filter((item) => item.bookId === bookId),
    [allHighlights, bookId],
  );
  const activeHighlight = activeHighlightTarget
    ? highlights.find((highlight) => highlight.id === activeHighlightTarget.highlightId)
    : undefined;
  const closeMobileOverlay = useCallback(() => {
    setCompactTocOpen(false);
    setActivePanel(null);
    setStylePopoverVisible(false);
  }, []);
  const { latestBookRef, queueLocationSave } = useDeferredBookLocation(book, updateBook);
  const { compactReader, mobileReader } = useReaderResponsiveLayout({
    workspaceRef,
    setActivePanel,
    setCompactTocOpen,
    setMobileChromeVisible,
  });
  const mobileOverlayOpen = mobileReader && (compactTocOpen || Boolean(activePanel));

  useMobileReaderOverlay({
    close: closeMobileOverlay,
    open: mobileOverlayOpen,
    setMobileChromeVisible,
  });

  useEffect(() => {
    if (!book) return;
    const chapter = book.toc.find((item) => item.label === book.currentChapter);
    setActiveHref(chapter?.href ?? book.toc[0]?.href);
    setActivePanel(null);
    setSelection(null);
    setActiveHighlightTarget(null);
    setCommentingHighlightId(null);
    setPendingCommentSelection(null);
    setCommentDraft('');
    setFocusedHighlightId(null);
    setPanelQuote(null);
    setCompactTocOpen(false);
    setMobileChromeVisible(true);
    setConversationId(createUuid());
    setReturnCfi(null);
    // Transient reader UI resets only when switching books; progress updates must not reset it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book?.id]);

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

  useReadingSession(book?.id, upsertReadingSession, recordPageChangeRef);

  useEffect(() => {
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      if (isReaderKeyboardEditingTarget(event.target)) return;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        event.preventDefault();
        readerRef.current?.prev();
      } else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        event.preventDefault();
        readerRef.current?.next();
      }
    };
    window.addEventListener('keyup', handleKeyUp);
    return () => window.removeEventListener('keyup', handleKeyUp);
  }, []);
  const handleLocationChange = useCallback(
    (location: ReaderLocationUpdate) => {
      const current = latestBookRef.current;
      if (!current) return;
      recordPageChangeRef.current?.(location.page, location.href, location.cfi);
      const chapter = findChapterLabel(current.toc, location.href) ?? current.currentChapter;
      setActiveHref(location.href);
      const roundedProgress =
        location.progress === undefined
          ? current.progress
          : Math.round(location.progress * 10) / 10;
      const hasChanged =
        Math.abs(current.progress - roundedProgress) >= 0.1 ||
        current.currentCfi !== location.cfi ||
        current.currentChapter !== chapter ||
        current.currentPage !== location.page ||
        current.totalPages !== location.totalPages;
      if (!hasChanged) return;
      const changes: Partial<BookItem> = {
        progress: roundedProgress,
        currentCfi: location.cfi ?? current.currentCfi,
        currentChapter: chapter,
        currentPage: location.page ?? current.currentPage,
        totalPages: location.totalPages ?? current.totalPages,
      };
      queueLocationSave(current, changes);
    },
    [latestBookRef, queueLocationSave],
  );
  const selectToc = (item: TocItem, closeOverlay = true) => {
    const cfi = latestBookRef.current?.currentCfi;
    if (cfi) setReturnCfi((original) => original ?? cfi);
    setActiveHref(item.href);
    readerRef.current?.display(item.href, item.label);
    if (closeOverlay) setCompactTocOpen(false);
  };
  const returnToProgress = returnCfi
    ? () => {
        readerRef.current?.display(returnCfi);
        setReturnCfi(null);
        setCompactTocOpen(false);
      }
    : undefined;
  const currentChapter = useMemo(
    () => (book ? (findChapterLabel(book.toc, activeHref) ?? book.currentChapter) : ''),
    [activeHref, book],
  );
  const readerHighlights = useMemo<HighlightItem[]>(() => {
    if (!book || !pendingCommentSelection) return highlights;
    return [
      ...highlights,
      createPendingCommentHighlight(book, pendingCommentSelection, currentChapter),
    ];
  }, [book, currentChapter, highlights, pendingCommentSelection]);

  if (!book) return { status: 'missing' as const, navigate };
  const handleDelete = () => {
    confirmDialog({
      title: `将《${book.title}》移到回收站？`,
      content: '书籍和相关学习记录会保留 30 天；期间可以恢复，也可以在回收站中彻底删除。',
      icon: <IconAlertTriangle size="large" style={{ color: 'var(--semi-color-warning)' }} />,
      okText: '移到回收站',
      cancelText: '取消',
      okButtonProps: { type: 'danger' },
      onOk: async () => {
        try {
          const trashedBook = await booksApi.moveToTrash(book.id);
          trashBook(book.id, trashedBook.deletedAt);
          Toast.success('已移到回收站，30 天内可以恢复');
          navigate('/');
        } catch (error) {
          Toast.error(error instanceof Error ? error.message : '无法将书籍移到回收站');
          throw error;
        }
      },
    });
  };

  function changeActivePanel(panel: MobileReaderPanel | null) {
    if (mobileReader && panel) setCompactTocOpen(false);
    if (mobileReader && panel) setStylePopoverVisible(false);
    setActivePanel(panel);
    setActiveHighlightTarget(null);
    setCommentingHighlightId(null);
    setPendingCommentSelection(null);
  }
  const {
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
  } = createReaderAnnotationActions({
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
  });
  const { startNewConversation, resumeConversation, openActivityPanel } =
    createReaderConversationActions({
      conversationId,
      openAIConfigs,
      aiPreferences,
      aiActivity,
      setConversationId,
      setPanelQuote,
      setAiPreferences,
      changeActivePanel,
    });
  return {
    status: 'ready' as const,
    activeHighlight,
    activeHighlightTarget,
    activeHref,
    activePanel,
    book,
    closeMobileOverlay,
    commentDraft,
    commentingHighlightId,
    compactReader,
    compactTocOpen,
    conversationId,
    currentChapter,
    focusedHighlightId,
    handleDelete,
    handleLocationChange,
    mobileChromeVisible,
    mobileOverlayOpen,
    mobileReader,
    navigate,
    panelQuote,
    pendingCommentSelection,
    preferences,
    readerHighlights,
    readerRef,
    returnToProgress,
    selectToc,
    selection,
    setActiveHighlightTarget,
    setCommentDraft,
    setCommentingHighlightId,
    setCompactTocOpen,
    setMobileChromeVisible,
    setPanelQuote,
    setPendingCommentSelection,
    setPreferences,
    setSelection,
    setStylePopoverVisible,
    stylePopoverVisible,
    themeMode,
    workspaceRef,
    changeActivePanel,
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
    startNewConversation,
    resumeConversation,
    openActivityPanel,
  };
}
