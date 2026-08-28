import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Allotment } from 'allotment';
import { Button, ButtonGroup, Dropdown, Empty, Modal, Progress, TextArea, Toast, Tooltip, Typography } from '@douyinfe/semi-ui';
import {
  IconAIStrokedLevel1,
  IconAlertTriangle,
  IconBookmark,
  IconComment,
  IconDeleteStroked,
  IconArrowLeft,
  IconMore,
} from '@douyinfe/semi-icons';
import { useNavigate, useParams } from 'react-router-dom';
import { ReaderActivityBar, ReaderRightPanel } from '../components/ReaderRightSidebar';
import {
  ReaderSurface,
  findChapterLabel,
  isReaderKeyboardEditingTarget,
  type ReaderLocationUpdate,
  type ReaderSurfaceHandle,
} from '../components/ReaderSurface';
import { ReaderToolbar } from '../components/ReaderToolbar';
import { TableOfContents } from '../components/TableOfContents';
import { removeEpubFile } from '../lib/epubStorage';
import { clamp } from '../lib/format';
import { useLearningStore } from '../store/useLearningStore';
import type { ChatSession, HighlightItem, ReaderHighlightTarget, ReaderSelection, RightPanel } from '../types';

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
  const [activePanel, setActivePanel] = useState<RightPanel>(null);
  const [compactReader, setCompactReader] = useState(() => window.innerWidth < 900);
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
  const highlights = useMemo(
    () => allHighlights.filter((item) => item.bookId === bookId),
    [allHighlights, bookId],
  );
  const activeHighlight = activeHighlightTarget
    ? highlights.find((highlight) => highlight.id === activeHighlightTarget.highlightId)
    : undefined;

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
        <Empty title="这本书不在书架中" description="它可能已被删除，或本地数据已被清理" />
        <Button theme="solid" type="primary" onClick={() => navigate('/')}>返回书架</Button>
      </main>
    );
  }

  const handleDelete = () => {
    Modal.confirm({
      title: `删除《${book.title}》？`,
      content: '书籍文件、阅读进度、笔记、高亮和评论都将从此设备删除，且无法恢复。',
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
    setActivePanel('ai');
    readerRef.current?.clearSelection();
    setSelection(null);
  };

  const jumpToHighlight = (highlight: HighlightItem) => {
    readerRef.current?.display(highlight.cfi);
  };

  const startNewConversation = () => {
    setConversationId(crypto.randomUUID());
    setPanelQuote(null);
    setActivePanel('ai');
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
    setActivePanel('ai');
  };

  return (
    <main className="reader-page">
      <header className="reader-header">
        <div className="reader-header__identity">
          <Tooltip content="返回书架" position="bottomLeft">
            <Button
              aria-label="退出阅读并返回书架"
              icon={<IconArrowLeft />}
              size="small"
              theme="borderless"
              type="tertiary"
              onClick={() => navigate('/')}
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
        <div className="reader-header__toolbar">
          <ReaderToolbar
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

      <div ref={workspaceRef} className="reader-workspace">
        {compactReader && compactTocOpen && (
          <div className="toc-column toc-column--overlay">
            <TableOfContents
              items={book.toc}
              activeHref={activeHref}
              progress={book.progress}
              onSelect={(item) => {
                setActiveHref(item.href);
                readerRef.current?.display(item.href);
                setCompactTocOpen(false);
              }}
            />
          </div>
        )}
        <Allotment
          proportionalLayout={false}
          separator={!compactReader && !preferences.tocCollapsed}
          onDragEnd={(sizes) => {
            if (!preferences.tocCollapsed && sizes[0]) {
              setPreferences({ tocWidth: clamp(sizes[0], 220, 400) });
            }
          }}
        >
          <Allotment.Pane
            visible={!compactReader && !preferences.tocCollapsed}
            preferredSize={preferences.tocWidth}
            minSize={220}
            maxSize={400}
          >
            <div className="toc-column">
              <TableOfContents
                items={book.toc}
                activeHref={activeHref}
                progress={book.progress}
                onSelect={(item) => {
                  setActiveHref(item.href);
                  readerRef.current?.display(item.href);
                }}
              />
            </div>
          </Allotment.Pane>

          <Allotment.Pane minSize={0}>
            <div className="reader-main">
              <Allotment
                proportionalLayout={false}
                separator={Boolean(activePanel)}
                onDragEnd={(sizes) => {
                  if (activePanel && sizes[1]) {
                    setPreferences({ panelWidth: clamp(sizes[1], 320, 720) });
                  }
                }}
              >
                <Allotment.Pane minSize={0}>
                  <section className="reader-center">
                    <div className="reader-content">
                      <ReaderSurface
                        ref={readerRef}
                        book={book}
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
                      />
                      {selection && (
                        <div
                          className={`selection-toolbar${selection.rect.top < 150 ? ' selection-toolbar--below' : ''}`}
                          role="toolbar"
                          aria-label="文本选择操作"
                          onMouseDown={(event) => event.preventDefault()}
                          style={{
                            left: clamp(selection.rect.left + selection.rect.width / 2, 120, window.innerWidth - 120),
                            top: selection.rect.top < 150
                              ? selection.rect.top + selection.rect.height + 8
                              : selection.rect.top - 8,
                          }}
                        >
                          <ButtonGroup
                            aria-label="文本选择操作"
                            className="selection-toolbar__button-group"
                            size="small"
                            theme="borderless"
                            type="tertiary"
                          >
                            <Button icon={<IconAIStrokedLevel1 />} onClick={askAboutSelection}>提问</Button>
                            <Button icon={<IconBookmark />} onClick={saveHighlight}>高亮</Button>
                            <Button icon={<IconComment />} onClick={createCommentFromSelection}>评论</Button>
                          </ButtonGroup>
                        </div>
                      )}
                      {(pendingCommentSelection || (activeHighlightTarget && activeHighlight && commentingHighlightId === activeHighlight.id)) && (
                          <form
                            className={`highlight-comment-editor${((pendingCommentSelection?.rect ?? activeHighlightTarget?.rect)?.top ?? 0) < 210 ? ' highlight-comment-editor--below' : ''}`}
                            aria-label={`评论高亮：${pendingCommentSelection?.text ?? activeHighlight?.text ?? ''}`}
                            style={{
                              left: clamp(
                                (pendingCommentSelection?.rect.left ?? activeHighlightTarget?.rect.left ?? 0)
                                  + (pendingCommentSelection?.rect.width ?? activeHighlightTarget?.rect.width ?? 0) / 2,
                                166,
                                window.innerWidth - 166,
                              ),
                              top: (pendingCommentSelection?.rect.top ?? activeHighlightTarget?.rect.top ?? 0) < 210
                                ? (pendingCommentSelection?.rect.top ?? activeHighlightTarget?.rect.top ?? 0)
                                  + (pendingCommentSelection?.rect.height ?? activeHighlightTarget?.rect.height ?? 0) + 8
                                : (pendingCommentSelection?.rect.top ?? activeHighlightTarget?.rect.top ?? 0) - 8,
                            }}
                            onSubmit={(event) => {
                              event.preventDefault();
                              saveHighlightComment();
                            }}
                          >
                            <TextArea
                              autoFocus
                              autosize={{ minRows: 3, maxRows: 6 }}
                              maxCount={1000}
                              placeholder="写下你对这段内容的见解…"
                              value={commentDraft}
                              onChange={setCommentDraft}
                              onKeyDown={(event) => {
                                if (event.key === 'Escape') {
                                  event.preventDefault();
                                  cancelCommentEditing();
                                } else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                                  event.preventDefault();
                                  saveHighlightComment();
                                }
                              }}
                            />
                            <div className="highlight-comment-editor__actions">
                              <Button
                                size="small"
                                theme="borderless"
                                type="tertiary"
                                onClick={cancelCommentEditing}
                              >
                                取消
                              </Button>
                              <Tooltip content="Cmd + Enter 可以保存" position="topRight">
                                <span>
                                  <Button
                                    disabled={!commentDraft.trim() && !(activeHighlight?.comment && !pendingCommentSelection)}
                                    htmlType="submit"
                                    size="small"
                                    theme="solid"
                                    type="primary"
                                  >
                                    保存
                                  </Button>
                                </span>
                              </Tooltip>
                            </div>
                          </form>
                      )}
                      {activeHighlightTarget && activeHighlight && commentingHighlightId !== activeHighlight.id && (
                          <div
                            className={`selection-toolbar${activeHighlightTarget.rect.top < 150 ? ' selection-toolbar--below' : ''}`}
                            role="toolbar"
                            aria-label="已高亮内容操作"
                            style={{
                              left: clamp(activeHighlightTarget.rect.left + activeHighlightTarget.rect.width / 2, 170, window.innerWidth - 170),
                              top: activeHighlightTarget.rect.top < 150
                                ? activeHighlightTarget.rect.top + activeHighlightTarget.rect.height + 8
                                : activeHighlightTarget.rect.top - 8,
                            }}
                          >
                            <ButtonGroup
                              aria-label="已高亮内容操作"
                              className="selection-toolbar__button-group"
                              size="small"
                              theme="borderless"
                              type="tertiary"
                            >
                              <Button icon={<IconDeleteStroked />} onClick={cancelHighlight}>取消划线</Button>
                              {activeHighlight.kind !== 'comment' && (
                                <Button icon={<IconBookmark />} onClick={viewHighlight}>在划线中查看</Button>
                              )}
                              <Button icon={<IconComment />} onClick={editHighlightComment}>
                                {activeHighlight.comment ? '查看评论' : '评论'}
                              </Button>
                            </ButtonGroup>
                          </div>
                      )}
                    </div>
                  </section>
                </Allotment.Pane>
                <Allotment.Pane
                  visible={Boolean(activePanel)}
                  preferredSize={preferences.panelWidth}
                  minSize={compactReader ? 0 : 320}
                  maxSize={720}
                >
                  {activePanel && (
                    <ReaderRightPanel
                      book={book}
                      activePanel={activePanel}
                      conversationId={conversationId}
                      selectedText={panelQuote ?? undefined}
                      getCurrentText={() => readerRef.current?.getCurrentText() ?? ''}
                      onClearSelectedText={() => setPanelQuote(null)}
                      onStartNewConversation={startNewConversation}
                      onResumeConversation={resumeConversation}
                      onJumpHighlight={jumpToHighlight}
                      focusedHighlightId={focusedHighlightId}
                    />
                  )}
                </Allotment.Pane>
              </Allotment>
              <ReaderActivityBar
                activePanel={activePanel}
                onChangePanel={(panel) => {
                  setActivePanel(panel);
                  setActiveHighlightTarget(null);
                  setCommentingHighlightId(null);
                  setPendingCommentSelection(null);
                }}
              />
            </div>
          </Allotment.Pane>
        </Allotment>
      </div>
    </main>
  );
}
