import ePub, { type Book as EpubBook, type Contents, type Location, type Rendition } from 'epubjs';
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from 'react';
import { Empty, Spin, Typography } from '@douyinfe/semi-ui';
import { getDemoContent } from '../data/demo';
import { loadEpubFile } from '../lib/epubStorage';
import { ensureReaderFontStylesheet, READER_FONT_STACKS } from '../lib/readerFonts';
import type { BookItem, HighlightItem, ReaderPreferences, ReaderSelection, ThemeMode, TocItem } from '../types';

const { Text } = Typography;

export interface ReaderLocationUpdate {
  cfi?: string;
  href?: string;
  progress?: number;
  page?: number;
  totalPages?: number;
}

export interface ReaderSurfaceHandle {
  next: () => void;
  prev: () => void;
  display: (target: string) => void;
  clearSelection: () => void;
  getCurrentText: () => string;
}

interface ReaderSurfaceProps {
  book: BookItem;
  preferences: ReaderPreferences;
  highlights: HighlightItem[];
  themeMode: ThemeMode;
  onLocationChange: (location: ReaderLocationUpdate) => void;
  onSelection: (selection: ReaderSelection | null) => void;
}

function flattenToc(items: TocItem[]): TocItem[] {
  return items.flatMap((item) => [item, ...flattenToc(item.subitems ?? [])]);
}

function findChapterLabel(items: TocItem[], href?: string) {
  if (!href) return undefined;
  const normalized = href.split('#')[0];
  return flattenToc(items).find((item) => item.href.split('#')[0] === normalized)?.label;
}

function getDemoScrollRatio(cfi: string | undefined, href: string | undefined) {
  if (!cfi || !href) return 0;
  const marker = ':scroll:';
  const markerIndex = cfi.lastIndexOf(marker);
  if (markerIndex < 0 || cfi.slice(5, markerIndex) !== href) return 0;
  const ratio = Number(cfi.slice(markerIndex + marker.length));
  return Number.isFinite(ratio) ? Math.max(0, Math.min(1, ratio)) : 0;
}

function redrawHighlightPanes(rendition: Rendition) {
  const redraw = () => {
    try {
      rendition.views().forEach((view) => {
        const pane = (view as unknown as { pane?: { render: () => void } }).pane;
        pane?.render();
      });
    } catch {
      // The rendition may have been replaced while a delayed redraw was pending.
    }
  };
  requestAnimationFrame(() => requestAnimationFrame(redraw));
  window.setTimeout(redraw, 120);
}

function hasActiveTextSelection(selection: Selection | null | undefined) {
  return Boolean(selection && !selection.isCollapsed && selection.toString().trim().length >= 2);
}

function applyReaderTheme(rendition: Rendition, preferences: ReaderPreferences) {
  const styles = getComputedStyle(document.body);
  const fontFamily = READER_FONT_STACKS[preferences.fontFamily];
  const background = preferences.theme === 'night'
    ? styles.getPropertyValue('--semi-color-bg-2').trim()
    : preferences.theme === 'paper'
      ? styles.getPropertyValue('--semi-color-warning-light-default').trim()
      : styles.getPropertyValue('--semi-color-bg-0').trim();
  const color = styles.getPropertyValue('--semi-color-text-0').trim();
  const textElements = 'body, body *';
  rendition.themes.register('learning-center-reader', {
    'html, body': {
      color: `${color} !important`,
      background: `${background} !important`,
    },
    body: {
      'font-size': `${preferences.fontSize}px !important`,
      'line-height': `${preferences.lineHeight} !important`,
      padding: '0 6% !important',
    },
    [textElements]: {
      color: `${color} !important`,
      'font-family': `${fontFamily} !important`,
    },
    'p, li': { 'line-height': `${preferences.lineHeight} !important` },
    'img, svg': { 'max-width': '100% !important' },
  });
  rendition.themes.select('learning-center-reader');
}

function renditionHasReadableText(rendition: Rendition) {
  const contents = rendition.getContents() as unknown as Contents[];
  return contents.some((content) => (content.document.body?.innerText.trim().length ?? 0) > 1);
}

function DemoReader({
  book,
  preferences,
  onSelection,
  controllerRef,
  onLocationChange,
}: Omit<ReaderSurfaceProps, 'highlights' | 'themeMode'> & { controllerRef: React.Ref<ReaderSurfaceHandle> }) {
  const readerRootRef = useRef<HTMLDivElement>(null);
  const chapters = useMemo(() => flattenToc(book.toc), [book.toc]);
  const initialIndex = Math.max(0, chapters.findIndex((item) => item.label === book.currentChapter));
  const [chapterIndex, setChapterIndex] = useState(initialIndex);
  const chapter = chapters[chapterIndex] ?? chapters[0];
  const content = getDemoContent(chapter?.href ?? 'chapter-5');
  const lastLocationCfiRef = useRef(book.currentCfi);

  useEffect(() => {
    void ensureReaderFontStylesheet(document, preferences.fontFamily);
  }, [preferences.fontFamily]);

  useEffect(() => {
    const handleSelectionChange = () => {
      const selection = window.getSelection();
      const selectionIsInsideReader = selection?.anchorNode && readerRootRef.current?.contains(selection.anchorNode);
      if (!hasActiveTextSelection(selection) || !selectionIsInsideReader) onSelection(null);
    };
    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, [onSelection]);

  useImperativeHandle(controllerRef, () => ({
    next: () => setChapterIndex((current) => Math.min(chapters.length - 1, current + 1)),
    prev: () => setChapterIndex((current) => Math.max(0, current - 1)),
    display: (target) => {
      const normalized = target.replace(/^demo:/, '').split(':')[0].split('#')[0];
      const index = chapters.findIndex((item) => item.href.split('#')[0] === normalized);
      if (index >= 0) setChapterIndex(index);
    },
    clearSelection: () => window.getSelection()?.removeAllRanges(),
    getCurrentText: () => [content.heading, ...content.paragraphs].join('\n\n'),
  }), [chapters, content.heading, content.paragraphs]);

  useEffect(() => {
    const readerRoot = readerRootRef.current;
    if (!readerRoot || !chapter) return;
    const savedRatio = getDemoScrollRatio(lastLocationCfiRef.current, chapter.href);
    let restored = false;
    let saveTimer: number | null = null;
    let outerFrame = 0;
    let innerFrame = 0;

    const reportLocation = () => {
      if (!restored) return;
      const maxScroll = Math.max(0, readerRoot.scrollHeight - readerRoot.clientHeight);
      const ratio = maxScroll ? readerRoot.scrollTop / maxScroll : 0;
      const progress = Math.max(0, Math.min(100, ((chapterIndex + ratio) / Math.max(1, chapters.length)) * 100));
      const cfi = `demo:${chapter.href}:scroll:${ratio.toFixed(6)}`;
      lastLocationCfiRef.current = cfi;
      onLocationChange({
        cfi,
        href: chapter.href,
        progress,
        page: book.totalPages ? Math.max(1, Math.round(book.totalPages * progress / 100)) : undefined,
        totalPages: book.totalPages,
      });
    };
    const scheduleSave = () => {
      if (saveTimer) window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(reportLocation, 120);
    };
    const flushWhenHidden = () => {
      if (document.visibilityState === 'hidden') reportLocation();
    };

    readerRoot.addEventListener('scroll', scheduleSave, { passive: true });
    document.addEventListener('visibilitychange', flushWhenHidden);
    window.addEventListener('pagehide', reportLocation);
    outerFrame = window.requestAnimationFrame(() => {
      innerFrame = window.requestAnimationFrame(() => {
        const maxScroll = Math.max(0, readerRoot.scrollHeight - readerRoot.clientHeight);
        readerRoot.scrollTop = maxScroll * savedRatio;
        restored = true;
        reportLocation();
      });
    });
    return () => {
      readerRoot.removeEventListener('scroll', scheduleSave);
      document.removeEventListener('visibilitychange', flushWhenHidden);
      window.removeEventListener('pagehide', reportLocation);
      window.cancelAnimationFrame(outerFrame);
      window.cancelAnimationFrame(innerFrame);
      if (saveTimer) window.clearTimeout(saveTimer);
      reportLocation();
    };
  }, [book.totalPages, chapter, chapterIndex, chapters.length, onLocationChange]);

  const handleMouseUp = (event: MouseEvent<HTMLElement>) => {
    const selection = window.getSelection();
    const text = selection?.toString().trim();
    if (!text || text.length < 2 || !event.currentTarget.contains(selection?.anchorNode ?? null)) {
      onSelection(null);
      return;
    }
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    const rect = range?.getBoundingClientRect();
    onSelection({
      text: text.slice(0, 600),
      cfi: `demo:${chapter?.href ?? 'chapter-1'}:${Date.now()}`,
      rect: {
        left: rect?.left ?? event.clientX,
        top: rect?.top ?? event.clientY,
        width: rect?.width ?? 0,
        height: rect?.height ?? 0,
      },
    });
  };

  return (
    <div ref={readerRootRef} className={`demo-reader demo-reader--${preferences.theme}`} onMouseUp={handleMouseUp}>
      <article style={{
        fontSize: preferences.fontSize,
        lineHeight: preferences.lineHeight,
        fontFamily: READER_FONT_STACKS[preferences.fontFamily],
      }}>
        <Text type="tertiary" className="reader-eyebrow">{content.eyebrow}</Text>
        <h1>{content.heading}</h1>
        {content.paragraphs.map((paragraph, index) => <p key={`${chapter?.id}-${index}`}>{paragraph}</p>)}
        <aside className="reader-callout">
          <strong>阅读提示</strong>
          <p>选中任意一段文字，即可高亮收藏或放入 AI 提问区。</p>
        </aside>
      </article>
    </div>
  );
}

function EpubReader({
  book,
  preferences,
  themeMode,
  highlights,
  onLocationChange,
  onSelection,
  controllerRef,
}: ReaderSurfaceProps & { controllerRef: React.Ref<ReaderSurfaceHandle> }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<EpubBook | null>(null);
  const renditionRef = useRef<Rendition | null>(null);
  const appliedHighlightCfisRef = useRef<Map<string, string>>(new Map());
  const currentCfiRef = useRef(book.currentCfi);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('请返回书架后重新导入这个 EPUB');
  const onLocationRef = useRef(onLocationChange);
  const onSelectionRef = useRef(onSelection);
  const preferencesRef = useRef(preferences);

  useEffect(() => { onLocationRef.current = onLocationChange; }, [onLocationChange]);
  useEffect(() => { onSelectionRef.current = onSelection; }, [onSelection]);
  useEffect(() => { preferencesRef.current = preferences; }, [preferences]);

  useImperativeHandle(controllerRef, () => ({
    next: () => { void renditionRef.current?.next().catch(() => setErrorMessage('无法翻到下一页，请尝试从目录跳转')); },
    prev: () => { void renditionRef.current?.prev().catch(() => setErrorMessage('无法翻到上一页，请尝试从目录跳转')); },
    display: (target) => { void renditionRef.current?.display(target).catch(() => setErrorMessage('无法定位到所选内容')); },
    clearSelection: () => {
      const contents = renditionRef.current?.getContents() as unknown as Contents[] | undefined;
      contents?.forEach((content) => content.window.getSelection()?.removeAllRanges());
    },
    getCurrentText: () => {
      const contents = renditionRef.current?.getContents() as unknown as Contents[] | undefined;
      return (contents ?? [])
        .map((content) => content.document.body?.innerText ?? '')
        .filter(Boolean)
        .join('\n\n');
    },
  }), []);

  useEffect(() => {
    let disposed = false;
    let resizeObserver: ResizeObserver | null = null;
    let resizeTimer: number | null = null;
    let lastWidth = 0;
    let lastHeight = 0;
    const selectionDocuments = new Set<Document>();
    const handleSelectionChange = (event: Event) => {
      const selectionDocument = event.currentTarget as Document;
      if (!hasActiveTextSelection(selectionDocument.defaultView?.getSelection())) {
        onSelectionRef.current(null);
      }
    };
    const watchSelection = (contents: Contents) => {
      const selectionDocument = contents.document;
      if (selectionDocuments.has(selectionDocument)) return;
      selectionDocuments.add(selectionDocument);
      selectionDocument.addEventListener('selectionchange', handleSelectionChange);
    };
    setStatus('loading');
    setErrorMessage('请返回书架后重新导入这个 EPUB');
    appliedHighlightCfisRef.current.clear();
    currentCfiRef.current = book.currentCfi;

    const setup = async () => {
      const data = await loadEpubFile(book.id);
      if (!data || !containerRef.current) throw new Error('EPUB 文件不存在');
      const epubBook = ePub(data);
      bookRef.current = epubBook;
      await epubBook.ready;
      if (disposed || !containerRef.current) {
        epubBook.destroy();
        return;
      }

      const rendition = epubBook.renderTo(containerRef.current, {
        width: '100%',
        height: '100%',
        spread: 'none',
        flow: 'paginated',
      });
      renditionRef.current = rendition;
      applyReaderTheme(rendition, preferencesRef.current);
      rendition.hooks.content.register((contents: Contents) => {
        void ensureReaderFontStylesheet(contents.document, preferencesRef.current.fontFamily);
        watchSelection(contents);
      });

      rendition.on('relocated', (location: Location) => {
        const cfi = location.start.cfi;
        currentCfiRef.current = cfi;
        const locationCount = epubBook.locations.length();
        const generatedProgress = locationCount && cfi ? epubBook.locations.percentageFromCfi(cfi) * 100 : undefined;
        onLocationRef.current({
          cfi,
          href: location.start.href,
          progress: generatedProgress === undefined
            ? undefined
            : Math.max(0, Math.min(100, generatedProgress)),
          page: location.start.displayed?.page,
          totalPages: locationCount || undefined,
        });
      });

      rendition.on('selected', (cfi: string, contents: Contents) => {
        const selection = contents.window.getSelection();
        const text = selection?.toString().trim();
        const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
        const rect = range?.getBoundingClientRect();
        const frameRect = contents.document.defaultView?.frameElement?.getBoundingClientRect();
        if (text && rect) {
          onSelectionRef.current({
            text: text.slice(0, 600),
            cfi,
            rect: {
              left: (frameRect?.left ?? 0) + rect.left,
              top: (frameRect?.top ?? 0) + rect.top,
              width: rect.width,
              height: rect.height,
            },
          });
        }
      });

      rendition.on('keydown', (event: KeyboardEvent) => {
        if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
        const target = event.target as HTMLElement | null;
        if (target?.closest('input, textarea, select, button, [contenteditable="true"], [role="textbox"], [role="combobox"], [role="listbox"], [role="menu"]')) return;
        if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
          event.preventDefault();
          void rendition.prev();
        } else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
          event.preventDefault();
          void rendition.next();
        }
      });

      rendition.on('rendered', () => redrawHighlightPanes(rendition));

      const chapterHref = flattenToc(book.toc).find((item) => item.label === book.currentChapter)?.href;
      const candidates = Array.from(new Set([
        book.currentCfi,
        chapterHref,
        ...flattenToc(book.toc).slice(0, 24).map((item) => item.href),
      ].filter((target): target is string => Boolean(target))));
      let displayed = false;
      for (const target of candidates) {
        try {
          await rendition.display(target);
          await new Promise((resolve) => window.setTimeout(resolve, 40));
          if (target === book.currentCfi || renditionHasReadableText(rendition)) {
            displayed = true;
            break;
          }
        } catch {
          // Continue with the chapter or first TOC target when a saved CFI is stale.
        }
      }
      if (!displayed) {
        await rendition.display();
        await new Promise((resolve) => window.setTimeout(resolve, 40));
      }
      if (disposed) return;
      const container = containerRef.current;
      if (container) {
        lastWidth = container.clientWidth;
        lastHeight = container.clientHeight;
        resizeObserver = new ResizeObserver(() => {
          const nextContainer = containerRef.current;
          if (!nextContainer) return;
          const width = nextContainer.clientWidth;
          const height = nextContainer.clientHeight;
          if (!width || !height || (width === lastWidth && height === lastHeight)) return;
          lastWidth = width;
          lastHeight = height;
          if (resizeTimer) window.clearTimeout(resizeTimer);
          resizeTimer = window.setTimeout(() => {
            (rendition.resize as (nextWidth: number, nextHeight: number, cfi?: string) => void)(
              width,
              height,
              currentCfiRef.current,
            );
            redrawHighlightPanes(rendition);
          }, 90);
        });
        resizeObserver.observe(container);
      }
      setStatus('ready');
      void epubBook.locations
        .generate(1200)
        .then(() => rendition.reportLocation())
        .catch(() => rendition.reportLocation().catch(() => undefined));
    };

    void setup().catch((error: unknown) => {
      if (!disposed) {
        setErrorMessage(error instanceof Error && error.message.includes('不存在')
          ? '本地 EPUB 文件不存在，请返回书架后重新导入'
          : '文件可能已损坏或不符合 EPUB 规范，请尝试重新导入');
        setStatus('error');
      }
    });

    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      selectionDocuments.forEach((selectionDocument) => {
        selectionDocument.removeEventListener('selectionchange', handleSelectionChange);
      });
      selectionDocuments.clear();
      if (resizeTimer) window.clearTimeout(resizeTimer);
      try {
        renditionRef.current?.destroy();
      } catch {
        // A partially initialized rendition can already be disposed by epub.js.
      }
      renditionRef.current = null;
      try {
        bookRef.current?.destroy();
      } catch {
        // Cleanup must never take down the surrounding React page.
      }
      bookRef.current = null;
      appliedHighlightCfisRef.current.clear();
      if (containerRef.current) containerRef.current.innerHTML = '';
    };
  }, [book.id]);

  useEffect(() => {
    const rendition = renditionRef.current;
    if (!rendition) return;
    applyReaderTheme(rendition, preferences);
    redrawHighlightPanes(rendition);
    const selectedFont = preferences.fontFamily;
    const contents = rendition.getContents() as unknown as Contents[];
    void Promise.all(contents.map(async (content) => {
      await ensureReaderFontStylesheet(content.document, selectedFont);
      await content.document.fonts?.ready;
    })).then(() => {
      if (preferencesRef.current.fontFamily !== selectedFont) return;
      redrawHighlightPanes(rendition);
      void rendition.reportLocation().catch(() => undefined);
    });
  }, [preferences.fontFamily, preferences.fontSize, preferences.lineHeight, preferences.theme, status, themeMode]);

  useEffect(() => {
    const rendition = renditionRef.current;
    if (!rendition) return;
    const highlightColor = getComputedStyle(document.body).getPropertyValue('--semi-color-warning-light-active').trim();
    const desiredHighlights = new Map(highlights.map((highlight) => [highlight.cfi, highlight]));
    const appliedHighlights = appliedHighlightCfisRef.current;

    appliedHighlights.forEach((appliedColor, cfi) => {
      if (desiredHighlights.has(cfi) && appliedColor === highlightColor) return;
      try {
        rendition.annotations.remove(cfi, 'highlight');
      } catch {
        // The rendition may already have unloaded this annotation.
      }
      appliedHighlights.delete(cfi);
    });

    desiredHighlights.forEach((highlight, cfi) => {
      if (appliedHighlights.get(cfi) === highlightColor) return;
      try {
        rendition.annotations.highlight(
          cfi,
          { highlightId: highlight.id },
          undefined,
          'reader-highlight',
          { fill: highlightColor, 'fill-opacity': '0.5', 'mix-blend-mode': 'multiply' },
        );
        appliedHighlights.set(cfi, highlightColor);
      } catch {
        // Invalid CFIs from a changed file are ignored without blocking reading.
      }
    });
    redrawHighlightPanes(rendition);
  }, [highlights, preferences.theme, status, themeMode]);

  return (
    <div className="epub-reader-wrap">
      {status === 'loading' && <div className="reader-status"><Spin size="large" /><Text type="tertiary">正在打开 EPUB…</Text></div>}
      {status === 'error' && <div className="reader-status"><Empty title="无法打开这本书" description={errorMessage} /></div>}
      <div ref={containerRef} className="epub-reader" aria-label={`《${book.title}》阅读区`} />
    </div>
  );
}

export const ReaderSurface = forwardRef<ReaderSurfaceHandle, ReaderSurfaceProps>(
  function ReaderSurface(props, ref) {
    if (props.book.kind === 'demo') {
      return <DemoReader {...props} controllerRef={ref} />;
    }
    return <EpubReader {...props} controllerRef={ref} />;
  },
);

export { findChapterLabel };
