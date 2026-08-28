import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Allotment } from 'allotment';
import { Button, Dropdown, Empty, Modal, Progress, Toast, Typography } from '@douyinfe/semi-ui';
import {
  IconAIStrokedLevel1,
  IconAlertTriangle,
  IconBookmark,
  IconDeleteStroked,
  IconEditStroked,
  IconMore,
} from '@douyinfe/semi-icons';
import { useNavigate, useParams } from 'react-router-dom';
import { ReaderActivityBar, ReaderRightPanel } from '../components/ReaderRightSidebar';
import { ReaderSurface, findChapterLabel, type ReaderLocationUpdate, type ReaderSurfaceHandle } from '../components/ReaderSurface';
import { ReaderToolbar } from '../components/ReaderToolbar';
import { TableOfContents } from '../components/TableOfContents';
import { removeEpubFile } from '../lib/epubStorage';
import { clamp } from '../lib/format';
import { useLearningStore } from '../store/useLearningStore';
import type { ChatSession, HighlightItem, ReaderSelection, RightPanel } from '../types';

const { Text } = Typography;

export function ReaderPage() {
  const { bookId = '' } = useParams();
  const navigate = useNavigate();
  const book = useLearningStore((state) => state.books.find((item) => item.id === bookId));
  const allHighlights = useLearningStore((state) => state.highlights);
  const updateBook = useLearningStore((state) => state.updateBook);
  const deleteBook = useLearningStore((state) => state.deleteBook);
  const addHighlight = useLearningStore((state) => state.addHighlight);
  const addNote = useLearningStore((state) => state.addNote);
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
  const [panelQuote, setPanelQuote] = useState<string | null>(null);
  const [activeHref, setActiveHref] = useState(book?.toc[0]?.href);
  const highlights = useMemo(
    () => allHighlights.filter((item) => item.bookId === bookId),
    [allHighlights, bookId],
  );

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
    setPanelQuote(null);
    setCompactTocOpen(false);
    setConversationId(crypto.randomUUID());
  }, [book?.id]);

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
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, button, [contenteditable="true"], [role="textbox"], [role="combobox"], [role="listbox"], [role="menu"]')) return;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        event.preventDefault();
        readerRef.current?.prev();
      } else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        event.preventDefault();
        readerRef.current?.next();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
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
      content: '书籍文件、阅读进度、笔记和划线都将从此设备删除，且无法恢复。',
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
    if (highlights.some((highlight) => highlight.cfi === selection.cfi)) {
      readerRef.current?.clearSelection();
      setSelection(null);
      Toast.info('这段文字已经高亮');
      return;
    }
    addHighlight({
      id: crypto.randomUUID(),
      bookId: book.id,
      text: selection.text,
      cfi: selection.cfi,
      chapter: currentChapter,
      page: book.currentPage,
      createdAt: Date.now(),
    });
    readerRef.current?.clearSelection();
    setActivePanel('highlights');
    setSelection(null);
    Toast.success('已加入划线');
  };

  const askAboutSelection = () => {
    if (!selection) return;
    setPanelQuote(selection.text);
    setActivePanel('ai');
    readerRef.current?.clearSelection();
    setSelection(null);
  };

  const createNoteFromSelection = () => {
    if (!selection) return;
    const timestamp = Date.now();
    addNote({
      id: crypto.randomUUID(),
      bookId: book.id,
      content: `> ${selection.text}\n\n`,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    setActivePanel('notes');
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
              {Math.round(book.progress)}% · {currentChapter}{book.currentPage ? ` · 第 ${book.currentPage} 页` : ''}
            </Text>
          </div>
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
            <Button aria-label="更多书籍操作" icon={<IconMore />} theme="borderless" />
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
                    <ReaderToolbar
                      preferences={preferences}
                      tocCollapsed={compactReader ? !compactTocOpen : preferences.tocCollapsed}
                      onChangePreferences={setPreferences}
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
                    <div className="reader-content">
                      <ReaderSurface
                        ref={readerRef}
                        book={book}
                        preferences={preferences}
                        themeMode={themeMode}
                        highlights={highlights}
                        onLocationChange={handleLocationChange}
                        onSelection={setSelection}
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
                          <Button icon={<IconAIStrokedLevel1 />} theme="borderless" onClick={askAboutSelection}>提问</Button>
                          <span className="selection-toolbar__divider" />
                          <Button icon={<IconBookmark />} theme="borderless" onClick={saveHighlight}>高亮</Button>
                          <span className="selection-toolbar__divider" />
                          <Button icon={<IconEditStroked />} theme="borderless" onClick={createNoteFromSelection}>笔记</Button>
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
                      onResumeConversation={resumeConversation}
                      onJumpHighlight={jumpToHighlight}
                    />
                  )}
                </Allotment.Pane>
              </Allotment>
              <ReaderActivityBar
                activePanel={activePanel}
                onChangePanel={setActivePanel}
                onStartNewConversation={startNewConversation}
              />
            </div>
          </Allotment.Pane>
        </Allotment>
      </div>
    </main>
  );
}
