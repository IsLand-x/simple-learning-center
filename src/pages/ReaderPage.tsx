import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Dropdown, Empty, Progress, Toast, Tooltip, Typography } from '@douyinfe/semi-ui';
import {
  IconAlertTriangle,
  IconDeleteStroked,
  IconArrowLeft,
  IconMore,
} from '@douyinfe/semi-icons';
import { useNavigate, useParams } from 'react-router-dom';
import { ReaderMobileChrome } from '../components/ReaderMobileChrome';
import type { MobileReaderPanel } from '../components/ReaderRightSidebar';
import {
  ReaderSurface,
  findChapterLabel,
  isReaderKeyboardEditingTarget,
  type ReaderLocationUpdate,
  type ReaderSurfaceHandle,
} from '../components/ReaderSurface';
import { ReaderSelectionOverlays } from '../components/ReaderSelectionOverlays';
import { ReaderDesktopToolbar } from '../components/ReaderToolbar';
import { ReaderWorkspace } from '../components/ReaderWorkspace';
import { confirmDialog } from '../lib/confirmDialog';
import { removeEpubFile } from '../lib/epubStorage';
import { useLearningStore } from '../store/useLearningStore';
import type { ChatSession, HighlightItem, ReaderHighlightTarget, ReaderSelection } from '../types';

const { Text } = Typography;
const PENDING_COMMENT_HIGHLIGHT_ID = 'pending-comment-highlight';

export function ReaderPage() {
  const { bookId = '' } = useParams();
  const navigate = useNavigate();
  const book = useLearningStore((state) => state.books.find((item) => item.id === bookId));
  const allHighlights = useLearningStore((state) => state.highlights);
  const updateBook = useLearningStore((state) => state.updateBook);
  const deleteBook = useLearningStore((state) => state.deleteBook);
  const addHighlight = useLearningStore((state) => state.addHighlight);
  const updateHighlight = useLearningStore((state) => state.updateHighlight);
  const deleteHighlight = useLearningStore((state) => state.deleteHighlight);
  const themeMode = useLearningStore((state) => state.themeMode);
  const preferences = useLearningStore((state) => state.readerPreferences);
  const setPreferences = useLearningStore((state) => state.setReaderPreferences);
  const upsertReadingSession = useLearningStore((state) => state.upsertReadingSession);
  const openAIConfigs = useLearningStore((state) => state.openAIConfigs);
  const setAiPreferences = useLearningStore((state) => state.setAiPreferences);
  const readerRef = useRef<ReaderSurfaceHandle>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const latestBookRef = useRef(book);
  const [activePanel, setActivePanel] = useState<MobileReaderPanel | null>(null);
  const [compactReader, setCompactReader] = useState(() => window.innerWidth < 900);
  const [mobileReader, setMobileReader] = useState(() => window.matchMedia('(max-width: 800px)').matches);
  const [mobileChromeVisible, setMobileChromeVisible] = useState(true);
  const [compactTocOpen, setCompactTocOpen] = useState(false);
  const [conversationId, setConversationId] = useState<string>(() => crypto.randomUUID());
  const [selection, setSelection] = useState<ReaderSelection | null>(null);
  const [activeHighlightTarget, setActiveHighlightTarget] = useState<ReaderHighlightTarget | null>(null);
  const [commentingHighlightId, setCommentingHighlightId] = useState<string | null>(null);
  const [pendingCommentSelection, setPendingCommentSelection] = useState<ReaderSelection | null>(null);
  const [commentDraft, setCommentDraft] = useState('');
  const [focusedHighlightId, setFocusedHighlightId] = useState<string | null>(null);
  const [panelQuote, setPanelQuote] = useState<string | null>(null);
  const [stylePopoverVisible, setStylePopoverVisible] = useState(false);
  const [activeHref, setActiveHref] = useState(book?.toc[0]?.href);
  const mobileOverlayHistoryActiveRef = useRef(false);
  const highlights = useMemo(
    () => allHighlights.filter((item) => item.bookId === bookId),
    [allHighlights, bookId],
  );
  const activeHighlight = activeHighlightTarget
    ? highlights.find((highlight) => highlight.id === activeHighlightTarget.highlightId)
    : undefined;
  const mobileOverlayOpen = mobileReader
    && (compactTocOpen || Boolean(activePanel));

  const closeMobileOverlay = useCallback(() => {
    setCompactTocOpen(false);
    setActivePanel(null);
    setStylePopoverVisible(false);
  }, []);

  useEffect(() => { latestBookRef.current = book; }, [book]);

  useEffect(() => {
    const workspace = workspaceRef.current;
    if (!workspace) return;
    const observer = new ResizeObserver(([entry]) => {
      const isCompact = entry.contentRect.width < 720;
      setCompactReader(isCompact);
      if (!isCompact) setCompactTocOpen(false);
    });
    observer.observe(workspace);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 800px)');
    const update = () => {
      setMobileReader(media.matches);
      if (!media.matches) setMobileChromeVisible(true);
      if (!media.matches) setActivePanel((panel) => panel === 'style' ? null : panel);
    };
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      if (!mobileOverlayHistoryActiveRef.current) return;
      mobileOverlayHistoryActiveRef.current = false;
      closeMobileOverlay();
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [closeMobileOverlay]);

  useEffect(() => {
    if (mobileOverlayOpen && !mobileOverlayHistoryActiveRef.current) {
      const currentState = window.history.state;
      window.history.pushState({
        ...(currentState && typeof currentState === 'object' ? currentState : {}),
        learningCenterMobileOverlay: true,
      }, '', window.location.href);
      mobileOverlayHistoryActiveRef.current = true;
      return;
    }
    if (!mobileOverlayOpen && mobileOverlayHistoryActiveRef.current) {
      mobileOverlayHistoryActiveRef.current = false;
      window.history.back();
    }
  }, [mobileOverlayOpen]);

  useEffect(() => {
    if (mobileOverlayOpen) setMobileChromeVisible(true);
  }, [mobileOverlayOpen]);

  useEffect(() => {
    if (!mobileOverlayOpen) return undefined;
    let touchStart: { x: number; y: number } | null = null;
    const handleTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) {
        touchStart = null;
        return;
      }
      touchStart = {
        x: event.touches[0].clientX,
        y: event.touches[0].clientY,
      };
    };
    const handleTouchEnd = (event: TouchEvent) => {
      if (!touchStart || event.changedTouches.length !== 1) {
        touchStart = null;
        return;
      }
      const deltaX = event.changedTouches[0].clientX - touchStart.x;
      const deltaY = event.changedTouches[0].clientY - touchStart.y;
      touchStart = null;
      if (Math.abs(deltaX) >= 64 && Math.abs(deltaX) > Math.abs(deltaY) * 1.25) {
        closeMobileOverlay();
      }
    };
    const resetTouch = () => { touchStart = null; };
    document.addEventListener('touchstart', handleTouchStart, { capture: true, passive: true });
    document.addEventListener('touchend', handleTouchEnd, { capture: true, passive: true });
    document.addEventListener('touchcancel', resetTouch, { capture: true, passive: true });
    return () => {
      document.removeEventListener('touchstart', handleTouchStart, true);
      document.removeEventListener('touchend', handleTouchEnd, true);
      document.removeEventListener('touchcancel', resetTouch, true);
    };
  }, [closeMobileOverlay, mobileOverlayOpen]);

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
    setConversationId(crypto.randomUUID());
  }, [book?.id]);

  useEffect(() => {
    if (!activeHighlightTarget && !pendingCommentSelection) return undefined;
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
  }, [activeHighlightTarget, pendingCommentSelection]);

  useEffect(() => {
    if (activeHighlightTarget && !activeHighlight) {
      setActiveHighlightTarget(null);
      setCommentingHighlightId(null);
    }
  }, [activeHighlight, activeHighlightTarget]);

  useEffect(() => {
    if (!book) return;
    const sessionId = crypto.randomUUID();
    const startedAt = Date.now();
    let accumulatedMs = 0;
    let activeSince = document.visibilityState === 'visible' ? Date.now() : null;

    const persistSession = (continueTiming: boolean) => {
      const now = Date.now();
      if (activeSince !== null) accumulatedMs += now - activeSince;
      activeSince = continueTiming && document.visibilityState === 'visible' ? now : null;
      if (accumulatedMs < 1000) return;
      upsertReadingSession({
        id: sessionId,
        bookId: book.id,
        startedAt,
        endedAt: now,
        durationMs: accumulatedMs,
      });
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        if (activeSince === null) activeSince = Date.now();
      } else {
        persistSession(false);
      }
    };
    const handlePageHide = () => persistSession(false);
    const interval = window.setInterval(() => persistSession(true), 15_000);
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('pagehide', handlePageHide);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('pagehide', handlePageHide);
      persistSession(false);
    };
  }, [book?.id, upsertReadingSession]);

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

  const handleLocationChange = useCallback((location: ReaderLocationUpdate) => {
    const current = latestBookRef.current;
    if (!current) return;
    const chapter = findChapterLabel(current.toc, location.href) ?? current.currentChapter;
    setActiveHref(location.href);
    const roundedProgress = location.progress === undefined
      ? current.progress
      : Math.round(location.progress * 10) / 10;
    const hasChanged =
      Math.abs(current.progress - roundedProgress) >= 0.1 ||
      current.currentCfi !== location.cfi ||
      current.currentChapter !== chapter ||
      current.currentPage !== location.page ||
      current.totalPages !== location.totalPages;
    if (!hasChanged) return;
    updateBook(current.id, {
      progress: roundedProgress,
      currentCfi: location.cfi ?? current.currentCfi,
      currentChapter: chapter,
      currentPage: location.page ?? current.currentPage,
      totalPages: location.totalPages ?? current.totalPages,
    });
  }, [updateBook]);

  const currentChapter = useMemo(
    () => (book ? findChapterLabel(book.toc, activeHref) ?? book.currentChapter : ''),
    [activeHref, book],
  );
  const readerHighlights = useMemo<HighlightItem[]>(() => {
    if (!book || !pendingCommentSelection) return highlights;
    return [
      ...highlights,
      {
        id: PENDING_COMMENT_HIGHLIGHT_ID,
        bookId: book.id,
        kind: 'comment',
        text: pendingCommentSelection.text,
        cfi: pendingCommentSelection.cfi,
        chapter: currentChapter,
        page: book.currentPage,
        createdAt: 0,
      },
    ];
  }, [book, currentChapter, highlights, pendingCommentSelection]);

  if (!book) {
    return (
      <main className="missing-book">
        <Empty title="这本书不在书架中" description="它可能已被删除，或服务器数据目录已被清理" />
        <Button theme="solid" type="primary" onClick={() => navigate('/')}>返回书架</Button>
      </main>
    );
  }

  const handleDelete = () => {
    confirmDialog({
      title: `删除《${book.title}》？`,
      content: '书籍文件、阅读进度、笔记、高亮和评论都将从服务器数据目录删除，且无法恢复。',
      icon: <IconAlertTriangle size="large" style={{ color: 'var(--semi-color-danger)' }} />,
      okText: '删除',
      cancelText: '取消',
      okButtonProps: { type: 'danger' },
      onOk: async () => {
        if (book.kind === 'epub') await removeEpubFile(book.id);
        deleteBook(book.id);
        Toast.success('书籍已删除');
        navigate('/');
      },
    });
  };

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
    const highlightId = crypto.randomUUID();
    addHighlight({
      id: highlightId,
      bookId: book.id,
      kind: 'highlight',
      text: selection.text,
      cfi: selection.cfi,
      chapter: currentChapter,
      page: book.currentPage,
      createdAt: Date.now(),
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
      addHighlight({
        id: crypto.randomUUID(),
        bookId: book.id,
        kind: 'comment',
        text: pendingCommentSelection.text,
        cfi: pendingCommentSelection.cfi,
        chapter: currentChapter,
        page: book.currentPage,
        comment,
        commentUpdatedAt: Date.now(),
        createdAt: Date.now(),
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
    setPanelQuote(selection.text);
    changeActivePanel('ai');
    readerRef.current?.clearSelection();
    setSelection(null);
  };

  const jumpToHighlight = (highlight: HighlightItem) => {
    readerRef.current?.display(highlight.cfi);
  };

  const startNewConversation = () => {
    setConversationId(crypto.randomUUID());
    setPanelQuote(null);
    changeActivePanel('ai');
  };

  const resumeConversation = (session: ChatSession) => {
    const config = session.provider
      ? openAIConfigs.find((item) => session.provider === `api:${item.id}`)
      : undefined;
    if (session.provider && config) {
      const model = session.model && config.models.includes(session.model)
        ? session.model
        : config.models[0] ?? '';
      setAiPreferences({ provider: session.provider, model });
    }
    setConversationId(session.id);
    setPanelQuote(null);
    changeActivePanel('ai');
  };

  function changeActivePanel(panel: MobileReaderPanel | null) {
    if (mobileReader && panel) setCompactTocOpen(false);
    if (mobileReader && panel) setStylePopoverVisible(false);
    setActivePanel(panel);
    setActiveHighlightTarget(null);
    setCommentingHighlightId(null);
    setPendingCommentSelection(null);
  }

  return (
    <main className={`reader-page${mobileReader && !mobileChromeVisible ? ' reader-page--mobile-immersive' : ''}`}>
      <header
        aria-hidden={mobileReader && !mobileChromeVisible}
        className="reader-header"
      >
        <div className="reader-header__identity">
          <Tooltip content={mobileOverlayOpen ? '关闭当前浮层' : '返回书架'} position="bottomLeft">
            <Button
              aria-label={mobileOverlayOpen ? '关闭当前浮层' : '退出阅读并返回书架'}
              className="reader-header__back"
              icon={<IconArrowLeft size="large" />}
              size="small"
              theme="borderless"
              type="tertiary"
              onClick={() => {
                if (mobileOverlayOpen) {
                  closeMobileOverlay();
                  return;
                }
                navigate('/');
              }}
            />
          </Tooltip>
          <Progress
            type="circle"
            percent={book.progress}
            width={28}
            showInfo={false}
            stroke="var(--semi-color-primary)"
          />
          <div className="reader-header__title">
            <Text strong ellipsis={{ showTooltip: true }}>{book.title}</Text>
            <Text size="small" type="tertiary">
              {Math.round(book.progress)}% · {currentChapter}
            </Text>
          </div>
        </div>
        {!mobileReader && (
          <div className="reader-header__toolbar">
            <ReaderDesktopToolbar
              preferences={preferences}
              tocCollapsed={compactReader ? !compactTocOpen : preferences.tocCollapsed}
              stylePopoverVisible={stylePopoverVisible}
              onChangePreferences={setPreferences}
              onStylePopoverVisibleChange={setStylePopoverVisible}
              onToggleToc={() => {
                if (compactReader) {
                  setCompactTocOpen((open) => !open);
                } else {
                  setPreferences({ tocCollapsed: !preferences.tocCollapsed });
                }
              }}
              onPrev={() => readerRef.current?.prev()}
              onNext={() => readerRef.current?.next()}
            />
          </div>
        )}
        <div className="reader-header__actions">
          <Dropdown
            trigger="hover"
            position="bottomRight"
            render={(
              <Dropdown.Menu>
                <Dropdown.Item type="danger" icon={<IconDeleteStroked />} onClick={handleDelete}>删除</Dropdown.Item>
              </Dropdown.Menu>
            )}
          >
            <Button aria-label="更多书籍操作" icon={<IconMore />} theme="borderless" type="tertiary" />
          </Dropdown>
        </div>
      </header>

      <ReaderWorkspace
        activeHref={activeHref}
        activePanel={activePanel === 'style' ? null : activePanel}
        book={book}
        compactReader={compactReader}
        compactTocOpen={compactTocOpen}
        conversationId={conversationId}
        desktop={!mobileReader}
        focusedHighlightId={focusedHighlightId}
        panelQuote={panelQuote}
        preferences={preferences}
        readerRef={readerRef}
        workspaceRef={workspaceRef}
        onChangePanel={changeActivePanel}
        onClearSelectedText={() => setPanelQuote(null)}
        onJumpHighlight={jumpToHighlight}
        onResumeConversation={resumeConversation}
        onSelectToc={(item, closeOverlay) => {
          setActiveHref(item.href);
          readerRef.current?.display(item.href, item.label);
          if (closeOverlay) setCompactTocOpen(false);
        }}
        onStartNewConversation={startNewConversation}
        onUpdatePreferences={setPreferences}
      >
        <ReaderSurface
          ref={readerRef}
          book={book}
          compactLayout={mobileReader}
          preferences={preferences}
          themeMode={themeMode}
          highlights={readerHighlights}
          onLocationChange={handleLocationChange}
          onSelection={setSelection}
          onHighlightClick={showHighlightActions}
          onContentInteraction={() => {
            setStylePopoverVisible(false);
            setActiveHighlightTarget(null);
            setCommentingHighlightId(null);
            setPendingCommentSelection(null);
          }}
          onCenterTap={() => {
            if (!mobileReader || mobileOverlayOpen) return;
            setMobileChromeVisible((visible) => !visible);
          }}
        />
        <ReaderSelectionOverlays
          activeHighlight={activeHighlight}
          activeHighlightTarget={activeHighlightTarget}
          commentDraft={commentDraft}
          commentingHighlightId={commentingHighlightId}
          pendingCommentSelection={pendingCommentSelection}
          selection={selection}
          onAskAboutSelection={askAboutSelection}
          onCancelCommentEditing={cancelCommentEditing}
          onCancelHighlight={cancelHighlight}
          onChangeCommentDraft={setCommentDraft}
          onCreateComment={createCommentFromSelection}
          onEditHighlightComment={editHighlightComment}
          onSaveHighlight={saveHighlight}
          onSaveHighlightComment={saveHighlightComment}
          onViewHighlight={viewHighlight}
        />
      </ReaderWorkspace>
      {mobileReader && (
        <ReaderMobileChrome
          activeHref={activeHref}
          activePanel={activePanel}
          book={book}
          compactTocOpen={compactTocOpen}
          conversationId={conversationId}
          focusedHighlightId={focusedHighlightId}
          panelQuote={panelQuote}
          preferences={preferences}
          readerRef={readerRef}
          visible={mobileChromeVisible}
          onChangePanel={changeActivePanel}
          onClearSelectedText={() => setPanelQuote(null)}
          onCloseToc={() => setCompactTocOpen(false)}
          onJumpHighlight={jumpToHighlight}
          onNext={() => readerRef.current?.next()}
          onPrev={() => readerRef.current?.prev()}
          onResumeConversation={resumeConversation}
          onSelectToc={(item) => {
            setActiveHref(item.href);
            readerRef.current?.display(item.href, item.label);
            setCompactTocOpen(false);
          }}
          onStartNewConversation={startNewConversation}
          onToggleToc={() => {
            const nextOpen = !compactTocOpen;
            if (nextOpen) changeActivePanel(null);
            setCompactTocOpen(nextOpen);
          }}
          onUpdatePreferences={setPreferences}
        />
      )}
    </main>
  );
}
