import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { IconComment } from '@douyinfe/semi-icons';
import { Typography } from '@douyinfe/semi-ui';
import { getDemoContent } from '../data/demo';
import { ensureReaderFontStylesheet, READER_FONT_STACKS } from '../lib/readerFonts';
import { isTextSelectionHold } from '../lib/readerGestures';
import { getReaderTextureStyle, resolveReaderStyle } from '../lib/readerThemes';
import type { BookItem, HighlightItem, ReaderHighlightTarget, ReaderPreferences, ReaderSelection, ThemeMode, TocItem } from '../types';
import { FoliateEpubReader } from './FoliateEpubReader';

const { Text } = Typography;
const COMMENT_INDICATOR_SIZE = 20;

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
  display: (target: string, label?: string) => void;
  clearSelection: () => void;
  getCurrentText: () => string;
}

export interface ReaderSurfaceProps {
  book: BookItem;
  compactLayout: boolean;
  preferences: ReaderPreferences;
  highlights: HighlightItem[];
  themeMode: ThemeMode;
  onLocationChange: (location: ReaderLocationUpdate) => void;
  onSelection: (selection: ReaderSelection | null) => void;
  onHighlightClick: (target: ReaderHighlightTarget) => void;
  onContentInteraction: () => void;
}

function flattenToc(items: TocItem[]): TocItem[] {
  return items.flatMap((item) => [item, ...flattenToc(item.subitems ?? [])]);
}

function findChapterLabel(items: TocItem[], href?: string) {
  if (!href) return undefined;
  const normalize = (value: string) => {
    try {
      return decodeURI(value).replace(/^\.\//, '').replace(/^\//, '');
    } catch {
      return value.replace(/^\.\//, '').replace(/^\//, '');
    }
  };
  const matches = (left: string, right: string) => {
    const normalizedLeft = normalize(left);
    const normalizedRight = normalize(right);
    return normalizedLeft === normalizedRight
      || normalizedLeft.endsWith(`/${normalizedRight}`)
      || normalizedRight.endsWith(`/${normalizedLeft}`);
  };
  const flattened = flattenToc(items);
  const exact = flattened.find((item) => matches(item.href, href));
  if (exact) return exact.label;
  const hrefWithoutFragment = href.split('#')[0];
  return flattened.find((item) => matches(item.href.split('#')[0], hrefWithoutFragment))?.label;
}

function getDemoScrollRatio(cfi: string | undefined, href: string | undefined) {
  if (!cfi || !href) return 0;
  const marker = ':scroll:';
  const markerIndex = cfi.lastIndexOf(marker);
  if (markerIndex < 0 || cfi.slice(5, markerIndex) !== href) return 0;
  const ratio = Number(cfi.slice(markerIndex + marker.length));
  return Number.isFinite(ratio) ? Math.max(0, Math.min(1, ratio)) : 0;
}

function hasActiveTextSelection(selection: Selection | null | undefined) {
  return Boolean(selection && !selection.isCollapsed && selection.toString().trim().length >= 2);
}

type PageTurnDirection = 'next' | 'prev';
interface SwipeStart {
  pointerId: number;
  pointerType: string;
  x: number;
  y: number;
  startedAt: number;
}

interface WheelSwipeState {
  consumed: boolean;
  direction: -1 | 0 | 1;
  horizontalSamples: number;
  lastEventAt: number;
}

interface WheelPageTurnResult {
  direction: PageTurnDirection | null;
  shouldPreventDefault: boolean;
}

const WHEEL_GESTURE_IDLE_MS = 280;

function isSwipeBlockedTarget(target: EventTarget | null) {
  const element = target as Element | null;
  return Boolean(
    element
    && typeof element.closest === 'function'
    && element.closest('a, button, input, textarea, select, [contenteditable="true"], [role="button"], [role="link"], [role="slider"]'),
  );
}

export function isReaderKeyboardEditingTarget(target: EventTarget | null) {
  const element = target as Element | null;
  return Boolean(
    element
    && typeof element.closest === 'function'
    && element.closest('input, textarea, select, [contenteditable="true"], [role="textbox"], [role="combobox"], [role="listbox"], [role="menu"], [role="slider"]'),
  );
}

function getSwipePageTurn(start: SwipeStart, endX: number, endY: number): PageTurnDirection | null {
  const horizontalDistance = endX - start.x;
  const verticalDistance = endY - start.y;
  if (
    (start.pointerType === 'touch'
      ? isTextSelectionHold(start.startedAt, performance.now())
      : performance.now() - start.startedAt > 1200)
    || Math.abs(horizontalDistance) < 56
    || Math.abs(horizontalDistance) < Math.abs(verticalDistance) * 1.35
  ) return null;
  return horizontalDistance < 0 ? 'next' : 'prev';
}

function createWheelSwipeState(): WheelSwipeState {
  return {
    consumed: false,
    direction: 0,
    horizontalSamples: 0,
    lastEventAt: 0,
  };
}

function getWheelPageTurn(state: WheelSwipeState, event: WheelEvent): WheelPageTurnResult {
  if (event.ctrlKey) return { direction: null, shouldPreventDefault: false };

  const now = performance.now();
  const eventGap = now - state.lastEventAt;
  if (eventGap > WHEEL_GESTURE_IDLE_MS) {
    state.consumed = false;
    state.direction = 0;
    state.horizontalSamples = 0;
  }
  state.lastEventAt = now;

  const deltaMultiplier = event.deltaMode === WheelEvent.DOM_DELTA_LINE
    ? 16
    : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
      ? Math.max(1, event.view?.innerWidth ?? window.innerWidth)
      : 1;
  const deltaX = event.deltaX * deltaMultiplier;
  const deltaY = event.deltaY * deltaMultiplier;
  const horizontalSpeed = Math.abs(deltaX);
  const verticalSpeed = Math.abs(deltaY);
  const currentEventIsHorizontal = horizontalSpeed > 0.25 && horizontalSpeed > verticalSpeed * 1.05;
  const direction = currentEventIsHorizontal ? (deltaX > 0 ? 1 : -1) : 0;

  if (state.consumed) {
    return {
      direction: null,
      shouldPreventDefault: currentEventIsHorizontal,
    };
  }
  if (!currentEventIsHorizontal) {
    if (verticalSpeed > horizontalSpeed * 2) {
      state.direction = 0;
      state.horizontalSamples = 0;
    }
    return { direction: null, shouldPreventDefault: false };
  }

  if (state.direction === direction) {
    state.horizontalSamples += 1;
  } else {
    state.direction = direction;
    state.horizontalSamples = 1;
  }
  const isFastSwipe = horizontalSpeed >= 18;
  if (!isFastSwipe && state.horizontalSamples < 2) {
    return { direction: null, shouldPreventDefault: true };
  }

  state.consumed = true;
  return {
    direction: direction > 0 ? 'next' : 'prev',
    shouldPreventDefault: true,
  };
}

function lastRenderedLineRect(element: HTMLElement) {
  const rects = Array.from(element.getClientRects()).filter((rect) => rect.width > 0 && rect.height > 0);
  return rects.reduce<DOMRect | undefined>((current, candidate) => {
    if (!current || candidate.top > current.top + 0.5) return candidate;
    if (Math.abs(candidate.top - current.top) > 0.5) return current;
    return candidate.right > current.right ? candidate : current;
  }, undefined) ?? element.getBoundingClientRect();
}

function DemoHighlightMark({
  highlight,
  onHighlightClick,
}: {
  highlight: HighlightItem;
  onHighlightClick: (target: ReaderHighlightTarget) => void;
}) {
  const markRef = useRef<HTMLElement>(null);
  const [commentIconPosition, setCommentIconPosition] = useState<{ left: number; top: number } | null>(null);

  const syncCommentIconPosition = useCallback(() => {
    const mark = markRef.current;
    if (!mark || !highlight.comment) return;
    const bounds = mark.getBoundingClientRect();
    const lastLine = lastRenderedLineRect(mark);
    const nextPosition = {
      left: lastLine.right - bounds.left - COMMENT_INDICATOR_SIZE / 2,
      top: lastLine.top - bounds.top - COMMENT_INDICATOR_SIZE / 2,
    };
    setCommentIconPosition((current) => (
      current?.left === nextPosition.left && current.top === nextPosition.top ? current : nextPosition
    ));
  }, [highlight.comment]);

  useLayoutEffect(() => {
    syncCommentIconPosition();
    const mark = markRef.current;
    const layoutContainer = mark?.closest('article');
    if (!mark || !layoutContainer) return undefined;
    const observer = new ResizeObserver(syncCommentIconPosition);
    observer.observe(layoutContainer);
    window.addEventListener('resize', syncCommentIconPosition);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', syncCommentIconPosition);
    };
  }, [syncCommentIconPosition]);

  const openHighlightActions = () => {
    const mark = markRef.current;
    if (!mark) return;
    const rect = lastRenderedLineRect(mark);
    onHighlightClick({
      highlightId: highlight.id,
      rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
    });
  };

  return (
    <mark
      ref={markRef}
      aria-label={highlight.comment ? `${highlight.text}，有评论` : highlight.text}
      className={`reader-inline-highlight${highlight.comment ? ' reader-inline-highlight--commented' : ''}`}
      role="button"
      tabIndex={0}
      onClick={openHighlightActions}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        openHighlightActions();
      }}
    >
      {highlight.text}
      {highlight.comment && (
        <span
          className="reader-inline-highlight__comment"
          style={commentIconPosition ?? undefined}
          aria-hidden="true"
        >
          <IconComment size="large" />
        </span>
      )}
    </mark>
  );
}

function renderDemoHighlightedText(
  text: string,
  highlights: HighlightItem[],
  onHighlightClick: (target: ReaderHighlightTarget) => void,
) {
  const candidates = highlights
    .map((highlight) => ({ highlight, start: text.indexOf(highlight.text) }))
    .filter((match) => match.start >= 0)
    .sort((left, right) => left.start - right.start);
  const matches: typeof candidates = [];
  let acceptedEnd = 0;
  candidates.forEach((match) => {
    if (match.start < acceptedEnd) return;
    matches.push(match);
    acceptedEnd = match.start + match.highlight.text.length;
  });
  if (!matches.length) return text;

  const content: React.ReactNode[] = [];
  let cursor = 0;
  matches.forEach(({ highlight, start }) => {
    if (start > cursor) content.push(text.slice(cursor, start));
    content.push(<DemoHighlightMark key={highlight.id} highlight={highlight} onHighlightClick={onHighlightClick} />);
    cursor = start + highlight.text.length;
  });
  if (cursor < text.length) content.push(text.slice(cursor));
  return content;
}

function DemoReader({
  book,
  compactLayout,
  preferences,
  highlights,
  onSelection,
  onHighlightClick,
  onContentInteraction,
  controllerRef,
  onLocationChange,
}: ReaderSurfaceProps & { controllerRef: React.Ref<ReaderSurfaceHandle> }) {
  const readerRootRef = useRef<HTMLDivElement>(null);
  const chapters = useMemo(() => flattenToc(book.toc), [book.toc]);
  const initialIndex = Math.max(0, chapters.findIndex((item) => item.label === book.currentChapter));
  const [chapterIndex, setChapterIndex] = useState(initialIndex);
  const chapterIndexRef = useRef(chapterIndex);
  chapterIndexRef.current = chapterIndex;
  const chapter = chapters[chapterIndex] ?? chapters[0];
  const content = getDemoContent(chapter?.href ?? 'chapter-5');
  const chapterHighlights = useMemo(
    () => highlights.filter((highlight) => highlight.cfi.startsWith(`demo:${chapter?.href ?? ''}:`)),
    [chapter?.href, highlights],
  );
  const readerStyle = resolveReaderStyle(preferences);
  const lastLocationCfiRef = useRef(book.currentCfi);
  const swipeStartRef = useRef<SwipeStart | null>(null);
  const wheelSwipeRef = useRef<WheelSwipeState>(createWheelSwipeState());

  const reportCurrentSelection = useCallback((fallbackX = 0, fallbackY = 0) => {
    const selection = window.getSelection();
    const selectionIsInsideReader = selection?.anchorNode && readerRootRef.current?.contains(selection.anchorNode);
    const text = selection?.toString().trim();
    if (!hasActiveTextSelection(selection) || !selectionIsInsideReader || !selection?.rangeCount || !text) {
      onSelection(null);
      return false;
    }
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    onSelection({
      text: text.slice(0, 600),
      cfi: `demo:${chapter?.href ?? 'chapter-1'}:selection:${Date.now()}`,
      rect: {
        left: rect.left || fallbackX,
        top: rect.top || fallbackY,
        width: rect.width,
        height: rect.height,
      },
    });
    return true;
  }, [chapter?.href, onSelection]);

  const turnDemoPage = (direction: PageTurnDirection) => {
    const currentIndex = chapterIndexRef.current;
    const nextIndex = direction === 'next'
      ? Math.min(chapters.length - 1, currentIndex + 1)
      : Math.max(0, currentIndex - 1);
    if (nextIndex === currentIndex) return;
    setChapterIndex(nextIndex);
  };

  useEffect(() => {
    void ensureReaderFontStylesheet(document, readerStyle.fontFamily);
  }, [readerStyle.fontFamily]);

  useEffect(() => {
    let selectionFrame = 0;
    const handleSelectionChange = () => {
      if (hasActiveTextSelection(window.getSelection())) swipeStartRef.current = null;
      window.cancelAnimationFrame(selectionFrame);
      selectionFrame = window.requestAnimationFrame(() => reportCurrentSelection());
    };
    document.addEventListener('selectionchange', handleSelectionChange);
    return () => {
      window.cancelAnimationFrame(selectionFrame);
      document.removeEventListener('selectionchange', handleSelectionChange);
    };
  }, [reportCurrentSelection]);

  useEffect(() => {
    const readerRoot = readerRootRef.current;
    if (!readerRoot) return;
    const handleWheel = (event: WheelEvent) => {
      if (isSwipeBlockedTarget(event.target) || hasActiveTextSelection(window.getSelection())) return;
      const result = getWheelPageTurn(wheelSwipeRef.current, event);
      if (result.shouldPreventDefault && event.cancelable) event.preventDefault();
      if (result.direction) {
        onContentInteraction();
        turnDemoPage(result.direction);
      }
    };
    readerRoot.addEventListener('wheel', handleWheel, { passive: false });
    return () => readerRoot.removeEventListener('wheel', handleWheel);
  }, [chapters.length, onContentInteraction]);

  useImperativeHandle(controllerRef, () => ({
    next: () => turnDemoPage('next'),
    prev: () => turnDemoPage('prev'),
    display: (target) => {
      const normalized = target.replace(/^demo:/, '').split(':')[0].split('#')[0];
      const index = chapters.findIndex((item) => item.href.split('#')[0] === normalized);
      if (index >= 0) setChapterIndex(index);
    },
    clearSelection: () => window.getSelection()?.removeAllRanges(),
    getCurrentText: () => [content.heading, ...content.paragraphs].join('\n\n'),
  }), [chapters, content.heading, content.paragraphs]);

  useLayoutEffect(() => {
    const readerRoot = readerRootRef.current;
    if (!readerRoot || !chapter) return;
    const savedRatio = getDemoScrollRatio(lastLocationCfiRef.current, chapter.href);
    let restored = false;
    let currentRatio = savedRatio;
    let saveTimer: number | null = null;

    const reportLocation = (ratio = currentRatio) => {
      if (!restored) return;
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
      if (!restored) return;
      const maxScroll = Math.max(0, readerRoot.scrollHeight - readerRoot.clientHeight);
      currentRatio = maxScroll ? readerRoot.scrollTop / maxScroll : 0;
      if (saveTimer) window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(() => reportLocation(currentRatio), 120);
    };
    const flushWhenHidden = () => {
      if (document.visibilityState === 'hidden') reportLocation(currentRatio);
    };

    readerRoot.addEventListener('scroll', scheduleSave, { passive: true });
    document.addEventListener('visibilitychange', flushWhenHidden);
    const handlePageHide = () => reportLocation(currentRatio);
    window.addEventListener('pagehide', handlePageHide);
    const maxScroll = Math.max(0, readerRoot.scrollHeight - readerRoot.clientHeight);
    readerRoot.scrollTop = maxScroll * savedRatio;
    currentRatio = maxScroll ? readerRoot.scrollTop / maxScroll : 0;
    restored = true;
    reportLocation(currentRatio);
    return () => {
      readerRoot.removeEventListener('scroll', scheduleSave);
      document.removeEventListener('visibilitychange', flushWhenHidden);
      window.removeEventListener('pagehide', handlePageHide);
      if (saveTimer) window.clearTimeout(saveTimer);
      reportLocation(currentRatio);
    };
  }, [book.totalPages, chapter, chapterIndex, chapters.length, onLocationChange]);

  const handleMouseUp = (event: MouseEvent<HTMLElement>) => {
    reportCurrentSelection(event.clientX, event.clientY);
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    onContentInteraction();
    if (
      !event.isPrimary
      || (event.pointerType === 'mouse' && event.button !== 0)
      || isSwipeBlockedTarget(event.target)
      || hasActiveTextSelection(window.getSelection())
    ) {
      swipeStartRef.current = null;
      return;
    }
    swipeStartRef.current = {
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      x: event.clientX,
      y: event.clientY,
      startedAt: performance.now(),
    };
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = swipeStartRef.current;
    if (!start || start.pointerId !== event.pointerId) return;
    swipeStartRef.current = null;
    if (hasActiveTextSelection(window.getSelection())) return;
    const direction = getSwipePageTurn(start, event.clientX, event.clientY);
    if (direction) turnDemoPage(direction);
  };

  const readerCssVariables = {
    '--reader-muted-color': readerStyle.mutedTextColor,
    '--reader-accent-color': readerStyle.accentColor,
    '--reader-callout-color': readerStyle.calloutColor,
    '--reader-highlight-color': readerStyle.highlightColor,
    '--reader-highlight-icon-color': readerStyle.textColor,
    '--reader-highlight-vertical-padding': `${Math.max(
      0,
      (readerStyle.fontSize * readerStyle.density.lineHeight - readerStyle.fontSize) / 2,
    )}px`,
    '--reader-paragraph-spacing': `${readerStyle.density.paragraphSpacing}em`,
  } as CSSProperties;
  const readerTextureStyle = getReaderTextureStyle(readerStyle.texture, readerStyle.isDark);

  return (
    <div
      ref={readerRootRef}
      className={`demo-reader demo-reader--${preferences.theme}`}
      style={{
        ...readerCssVariables,
        color: readerStyle.textColor,
        backgroundColor: readerStyle.paperColor,
        ...readerTextureStyle,
      }}
      onMouseUp={handleMouseUp}
      onContextMenu={(event) => event.preventDefault()}
      onPointerDown={handlePointerDown}
      onPointerMove={() => {
        if (hasActiveTextSelection(window.getSelection())) swipeStartRef.current = null;
      }}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => { swipeStartRef.current = null; }}
    >
      <article style={{
        fontSize: readerStyle.fontSize,
        lineHeight: readerStyle.density.lineHeight,
        letterSpacing: readerStyle.density.letterSpacing,
        fontFamily: READER_FONT_STACKS[readerStyle.fontFamily],
        paddingLeft: compactLayout ? 'clamp(14px, 4vw, 20px)' : readerStyle.density.pagePadding,
        paddingRight: compactLayout ? 'clamp(14px, 4vw, 20px)' : readerStyle.density.pagePadding,
      }}>
        <Text className="reader-eyebrow">{content.eyebrow}</Text>
        <h1>{content.heading}</h1>
        {content.paragraphs.map((paragraph, index) => (
          <p key={`${chapter?.id}-${index}`}>
            {renderDemoHighlightedText(paragraph, chapterHighlights, onHighlightClick)}
          </p>
        ))}
        <aside className="reader-callout">
          <strong>阅读提示</strong>
          <p>选中任意一段文字，即可高亮收藏或放入 AI 提问区。</p>
        </aside>
      </article>
    </div>
  );
}

export const ReaderSurface = forwardRef<ReaderSurfaceHandle, ReaderSurfaceProps>(
  function ReaderSurface(props, ref) {
    if (props.book.kind === 'demo') {
      return <DemoReader {...props} controllerRef={ref} />;
    }
    return <FoliateEpubReader {...props} controllerRef={ref} />;
  },
);

export { findChapterLabel };
