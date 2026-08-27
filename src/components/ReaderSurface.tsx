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
import type { BookItem, HighlightItem, ReaderPreferences, ReaderSelection, TocItem } from '../types';

const { Text } = Typography;

export interface ReaderLocationUpdate {
  cfi?: string;
  href?: string;
  progress: number;
  page?: number;
  totalPages?: number;
}

export interface ReaderSurfaceHandle {
  next: () => void;
  prev: () => void;
  display: (target: string) => void;
}

interface ReaderSurfaceProps {
  book: BookItem;
  preferences: ReaderPreferences;
  highlights: HighlightItem[];
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

function DemoReader({
  book,
  preferences,
  onSelection,
  controllerRef,
  onLocationChange,
}: Omit<ReaderSurfaceProps, 'highlights'> & { controllerRef: React.Ref<ReaderSurfaceHandle> }) {
  const chapters = useMemo(() => flattenToc(book.toc), [book.toc]);
  const initialIndex = Math.max(0, chapters.findIndex((item) => item.label === book.currentChapter));
  const [chapterIndex, setChapterIndex] = useState(initialIndex);
  const chapter = chapters[chapterIndex] ?? chapters[0];
  const content = getDemoContent(chapter?.href ?? 'chapter-5');

  useImperativeHandle(controllerRef, () => ({
    next: () => setChapterIndex((current) => Math.min(chapters.length - 1, current + 1)),
    prev: () => setChapterIndex((current) => Math.max(0, current - 1)),
    display: (target) => {
      const normalized = target.replace(/^demo:/, '').split(':')[0].split('#')[0];
      const index = chapters.findIndex((item) => item.href.split('#')[0] === normalized);
      if (index >= 0) setChapterIndex(index);
    },
  }), [chapters]);

  useEffect(() => {
    if (!chapter) return;
    const progress = Math.round(((chapterIndex + 1) / Math.max(1, chapters.length)) * 100);
    onLocationChange({
      href: chapter.href,
      progress,
      page: Math.max(1, Math.round((book.totalPages ?? 200) * progress / 100)),
      totalPages: book.totalPages,
    });
  }, [book.totalPages, chapter, chapterIndex, chapters.length, onLocationChange]);

  const handleMouseUp = (event: MouseEvent<HTMLElement>) => {
    const selection = window.getSelection();
    const text = selection?.toString().trim();
    if (!text || text.length < 2 || !event.currentTarget.contains(selection?.anchorNode ?? null)) {
      onSelection(null);
      return;
    }
    onSelection({ text: text.slice(0, 600), cfi: `demo:${chapter?.href ?? 'chapter-1'}:${Date.now()}` });
  };

  return (
    <div className={`demo-reader demo-reader--${preferences.theme}`} onMouseUp={handleMouseUp}>
      <article style={{ fontSize: preferences.fontSize, lineHeight: preferences.lineHeight }}>
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
  highlights,
  onLocationChange,
  onSelection,
  controllerRef,
}: ReaderSurfaceProps & { controllerRef: React.Ref<ReaderSurfaceHandle> }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<EpubBook | null>(null);
  const renditionRef = useRef<Rendition | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const onLocationRef = useRef(onLocationChange);
  const onSelectionRef = useRef(onSelection);

  useEffect(() => { onLocationRef.current = onLocationChange; }, [onLocationChange]);
  useEffect(() => { onSelectionRef.current = onSelection; }, [onSelection]);

  useImperativeHandle(controllerRef, () => ({
    next: () => { void renditionRef.current?.next(); },
    prev: () => { void renditionRef.current?.prev(); },
    display: (target) => { void renditionRef.current?.display(target); },
  }), []);

  useEffect(() => {
    let disposed = false;
    setStatus('loading');

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

      rendition.on('relocated', (location: Location) => {
        const cfi = location.start.cfi;
        const locationCount = epubBook.locations.length();
        const generatedProgress = locationCount && cfi ? epubBook.locations.percentageFromCfi(cfi) * 100 : undefined;
        const rawProgress = generatedProgress ?? (location.start.percentage ?? 0) * 100;
        onLocationRef.current({
          cfi,
          href: location.start.href,
          progress: Math.max(0, Math.min(100, rawProgress)),
          page: location.start.displayed?.page,
          totalPages: locationCount || location.start.displayed?.total,
        });
      });

      rendition.on('selected', (cfi: string, contents: Contents) => {
        const text = contents.window.getSelection()?.toString().trim();
        if (text) onSelectionRef.current({ text: text.slice(0, 600), cfi });
      });

      await rendition.display(book.currentCfi || undefined);
      if (disposed) return;
      setStatus('ready');
      void epubBook.locations.generate(1200).then(() => rendition.reportLocation());
    };

    void setup().catch(() => {
      if (!disposed) setStatus('error');
    });

    return () => {
      disposed = true;
      renditionRef.current?.destroy();
      renditionRef.current = null;
      bookRef.current?.destroy();
      bookRef.current = null;
      if (containerRef.current) containerRef.current.innerHTML = '';
    };
  }, [book.id]);

  useEffect(() => {
    const rendition = renditionRef.current;
    if (!rendition) return;
    const styles = getComputedStyle(document.body);
    const background = preferences.theme === 'night'
      ? styles.getPropertyValue('--semi-color-bg-2')
      : preferences.theme === 'paper'
        ? styles.getPropertyValue('--semi-color-warning-light-default')
        : styles.getPropertyValue('--semi-color-bg-0');
    const color = styles.getPropertyValue('--semi-color-text-0');
    rendition.themes.register('learning-center-reader', {
      body: {
        color: `${color} !important`,
        background: `${background} !important`,
        'font-family': 'Georgia, "Noto Serif SC", serif !important',
        'font-size': `${preferences.fontSize}px !important`,
        'line-height': `${preferences.lineHeight} !important`,
        padding: '0 6% !important',
      },
      'p, li': { 'line-height': `${preferences.lineHeight} !important` },
      'img, svg': { 'max-width': '100% !important' },
    });
    rendition.themes.select('learning-center-reader');
  }, [preferences.fontSize, preferences.lineHeight, preferences.theme, status]);

  useEffect(() => {
    const rendition = renditionRef.current;
    if (!rendition) return;
    const highlightColor = getComputedStyle(document.body).getPropertyValue('--semi-color-warning-light-active');
    highlights.forEach((highlight) => {
      try {
        rendition.annotations.highlight(
          highlight.cfi,
          { highlightId: highlight.id },
          undefined,
          'reader-highlight',
          { fill: highlightColor, 'fill-opacity': '0.5', 'mix-blend-mode': 'multiply' },
        );
      } catch {
        // Invalid CFIs from a changed file are ignored without blocking reading.
      }
    });
  }, [highlights, status]);

  return (
    <div className="epub-reader-wrap">
      {status === 'loading' && <div className="reader-status"><Spin size="large" /><Text type="tertiary">正在打开 EPUB…</Text></div>}
      {status === 'error' && <div className="reader-status"><Empty title="无法打开这本书" description="本地文件可能已被浏览器清理，请重新导入 EPUB" /></div>}
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
