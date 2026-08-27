import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Dropdown, Empty, Modal, Progress, Tag, Toast, Tooltip, Typography } from '@douyinfe/semi-ui';
import {
  IconAIStrokedLevel1,
  IconBookmark,
  IconClose,
  IconDeleteStroked,
  IconMore,
} from '@douyinfe/semi-icons';
import { useNavigate, useParams } from 'react-router-dom';
import { ReaderRightSidebar } from '../components/ReaderRightSidebar';
import { ReaderSurface, findChapterLabel, type ReaderLocationUpdate, type ReaderSurfaceHandle } from '../components/ReaderSurface';
import { ReaderToolbar } from '../components/ReaderToolbar';
import { SplitHandle } from '../components/SplitHandle';
import { TableOfContents } from '../components/TableOfContents';
import { removeEpubFile } from '../lib/epubStorage';
import { clamp } from '../lib/format';
import { useLearningStore } from '../store/useLearningStore';
import type { HighlightItem, ReaderSelection, RightPanel } from '../types';

const { Text } = Typography;

export function ReaderPage() {
  const { bookId = '' } = useParams();
  const navigate = useNavigate();
  const book = useLearningStore((state) => state.books.find((item) => item.id === bookId));
  const highlights = useLearningStore((state) => state.highlights.filter((item) => item.bookId === bookId));
  const updateBook = useLearningStore((state) => state.updateBook);
  const deleteBook = useLearningStore((state) => state.deleteBook);
  const addHighlight = useLearningStore((state) => state.addHighlight);
  const preferences = useLearningStore((state) => state.readerPreferences);
  const setPreferences = useLearningStore((state) => state.setReaderPreferences);
  const readerRef = useRef<ReaderSurfaceHandle>(null);
  const latestBookRef = useRef(book);
  const [activePanel, setActivePanel] = useState<RightPanel>(null);
  const [selection, setSelection] = useState<ReaderSelection | null>(null);
  const [activeHref, setActiveHref] = useState(book?.toc[0]?.href);

  useEffect(() => { latestBookRef.current = book; }, [book]);

  useEffect(() => {
    if (!book) return;
    const chapter = book.toc.find((item) => item.label === book.currentChapter);
    setActiveHref(chapter?.href ?? book.toc[0]?.href);
    setActivePanel(null);
    setSelection(null);
  }, [book?.id]);

  useEffect(() => {
    const handleSaveShortcut = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 's') return;
      event.preventDefault();
      Toast.success('阅读进度已保存在本地');
    };
    window.addEventListener('keydown', handleSaveShortcut);
    return () => window.removeEventListener('keydown', handleSaveShortcut);
  }, []);

  const handleLocationChange = useCallback((location: ReaderLocationUpdate) => {
    const current = latestBookRef.current;
    if (!current) return;
    const chapter = findChapterLabel(current.toc, location.href) ?? current.currentChapter;
    setActiveHref(location.href);
    const roundedProgress = Math.round(location.progress * 10) / 10;
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
    addHighlight({
      id: crypto.randomUUID(),
      bookId: book.id,
      text: selection.text,
      cfi: selection.cfi,
      chapter: currentChapter,
      page: book.currentPage,
      createdAt: Date.now(),
    });
    setActivePanel('highlights');
    setSelection(null);
    Toast.success('已加入划线');
  };

  const jumpToHighlight = (highlight: HighlightItem) => {
    readerRef.current?.display(highlight.cfi);
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
          <Tag color="green" size="small">已自动保存</Tag>
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

      <div className="reader-workspace">
        <div className="toc-column" style={{ width: preferences.tocWidth }}>
          <TableOfContents
            items={book.toc}
            activeHref={activeHref}
            onSelect={(item) => {
              setActiveHref(item.href);
              readerRef.current?.display(item.href);
            }}
          />
        </div>
        <SplitHandle
          label="调整目录宽度"
          onDelta={(delta) => setPreferences({ tocWidth: clamp(preferences.tocWidth + delta, 220, 400) })}
        />

        <section className="reader-center">
          <ReaderToolbar
            preferences={preferences}
            onChangePreferences={setPreferences}
            onPrev={() => readerRef.current?.prev()}
            onNext={() => readerRef.current?.next()}
          />
          <div className="reader-content">
            <ReaderSurface
              ref={readerRef}
              book={book}
              preferences={preferences}
              highlights={highlights}
              onLocationChange={handleLocationChange}
              onSelection={setSelection}
            />
            {selection && (
              <div className="selection-toolbar" role="toolbar" aria-label="文本选择操作">
                <Button
                  icon={<IconAIStrokedLevel1 />}
                  theme="borderless"
                  onClick={() => setActivePanel('ai')}
                >
                  快速提问
                </Button>
                <span className="selection-toolbar__divider" />
                <Button icon={<IconBookmark />} theme="borderless" onClick={saveHighlight}>高亮收藏</Button>
                <Tooltip content="关闭">
                  <Button aria-label="关闭文本操作栏" icon={<IconClose />} theme="borderless" onClick={() => setSelection(null)} />
                </Tooltip>
              </div>
            )}
          </div>
        </section>

        {activePanel && (
          <SplitHandle
            label="调整右侧面板宽度"
            onDelta={(delta) => setPreferences({ panelWidth: clamp(preferences.panelWidth - delta, 320, 720) })}
          />
        )}
        <ReaderRightSidebar
          book={book}
          activePanel={activePanel}
          width={preferences.panelWidth}
          selectedText={selection?.text}
          onChangePanel={setActivePanel}
          onJumpHighlight={jumpToHighlight}
        />
      </div>
    </main>
  );
}
