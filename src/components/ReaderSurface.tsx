import ePub, { type Book as EpubBook, type Contents, type Location, type Rendition } from 'epubjs';
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
import { Empty, Spin, Typography } from '@douyinfe/semi-ui';
import { getDemoContent } from '../data/demo';
import { loadEpubFile } from '../lib/epubStorage';
import { ensureReaderFontStylesheet, READER_FONT_STACKS } from '../lib/readerFonts';
import { getReaderTextureStyle, resolveReaderStyle } from '../lib/readerThemes';
import type { BookItem, HighlightItem, ReaderHighlightTarget, ReaderPreferences, ReaderSelection, ThemeMode, TocItem } from '../types';

const { Text } = Typography;
const COMMENT_INDICATOR_SIZE = 20;
const HIGHLIGHT_OVERLAY_FILL_OPACITY = '0.48';

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
  onHighlightClick: (target: ReaderHighlightTarget) => void;
  onContentInteraction: () => void;
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

function redrawHighlightPanes(rendition: Rendition, afterRedraw: () => void) {
  const hideCurrentOverlays = () => {
    try {
      rendition.views().forEach((view) => {
        const pane = (view as unknown as { pane?: { element?: SVGSVGElement } }).pane;
        pane?.element?.querySelectorAll<SVGGElement>('g.reader-highlight').forEach((group) => {
          group.style.opacity = '0';
        });
      });
    } catch {
      // The rendition may have been replaced while a layout update was pending.
    }
  };
  const redraw = () => {
    try {
      hideCurrentOverlays();
      rendition.views().forEach((view) => {
        const pane = (view as unknown as { pane?: { render: () => void } }).pane;
        pane?.render();
      });
      afterRedraw();
    } catch {
      // The rendition may have been replaced while a delayed redraw was pending.
    }
  };
  redraw();
  requestAnimationFrame(redraw);
}

function getHighlightLineHeight(preferences: ReaderPreferences) {
  const style = resolveReaderStyle(preferences);
  return style.fontSize * style.density.lineHeight;
}

function getHighlightBlendMode(preferences: ReaderPreferences) {
  return resolveReaderStyle(preferences).isDark ? 'screen' : 'multiply';
}

function expandHighlightRectToLineHeight(rect: SVGRectElement, targetLineHeight: number) {
  const renderedY = Number(rect.getAttribute('y'));
  const renderedHeight = Number(rect.getAttribute('height'));
  const originalY = Number(rect.dataset.readerOriginalY ?? renderedY);
  const originalHeight = Number(rect.dataset.readerOriginalHeight ?? renderedHeight);
  if (
    !Number.isFinite(originalY)
    || !Number.isFinite(originalHeight)
    || originalHeight <= 0
    || !Number.isFinite(targetLineHeight)
  ) return;

  rect.dataset.readerOriginalY = String(originalY);
  rect.dataset.readerOriginalHeight = String(originalHeight);
  const expandedHeight = Math.max(originalHeight, targetLineHeight);
  rect.setAttribute('y', String(originalY - (expandedHeight - originalHeight) / 2));
  rect.setAttribute('height', String(expandedHeight));
}

function syncHighlightOverlays(
  container: HTMLElement,
  commentedHighlightIds: Set<string>,
  commentIconTemplate: HTMLElement | null,
  targetLineHeight: number,
  targetBlendMode: string,
) {
  container.querySelectorAll<SVGGElement>('g.reader-highlight').forEach((group) => {
    group.querySelector('.reader-highlight-comment-indicator')?.remove();
    const rects = Array.from(group.querySelectorAll<SVGRectElement>(':scope > rect'));
    if (!rects.length) return;
    rects.forEach((rect) => {
      expandHighlightRectToLineHeight(rect, targetLineHeight);
      rect.style.fillOpacity = HIGHLIGHT_OVERLAY_FILL_OPACITY;
      rect.style.mixBlendMode = targetBlendMode;
    });
    group.style.opacity = '1';

    const highlightId = group.dataset.highlightId;
    if (!highlightId || !commentedHighlightIds.has(highlightId)) return;
    const lastLineRect = rects.reduce((current, candidate) => {
      const currentTop = Number(current.getAttribute('y'));
      const candidateTop = Number(candidate.getAttribute('y'));
      if (candidateTop > currentTop + 0.5) return candidate;
      if (Math.abs(candidateTop - currentTop) > 0.5) return current;
      const currentRight = Number(current.getAttribute('x')) + Number(current.getAttribute('width'));
      const candidateRight = Number(candidate.getAttribute('x')) + Number(candidate.getAttribute('width'));
      return candidateRight > currentRight ? candidate : current;
    });
    const right = Number(lastLineRect.getAttribute('x')) + Number(lastLineRect.getAttribute('width'));
    const top = Number(lastLineRect.getAttribute('y'));
    if (!Number.isFinite(right) || !Number.isFinite(top)) return;

    const templateSvg = commentIconTemplate?.querySelector<SVGSVGElement>('svg');
    if (!templateSvg) return;
    const indicator = templateSvg.cloneNode(true) as SVGSVGElement;
    const indicatorOffset = COMMENT_INDICATOR_SIZE / 2;
    indicator.classList.add('reader-highlight-comment-indicator');
    indicator.setAttribute('aria-hidden', 'true');
    indicator.setAttribute('x', String(right - indicatorOffset));
    indicator.setAttribute('y', String(top - indicatorOffset));
    indicator.setAttribute('width', String(COMMENT_INDICATOR_SIZE));
    indicator.setAttribute('height', String(COMMENT_INDICATOR_SIZE));
    indicator.setAttribute('pointer-events', 'none');
    indicator.style.color = 'var(--reader-highlight-icon-color)';
    indicator.style.backgroundColor = 'var(--reader-highlight-color)';
    indicator.style.borderRadius = '50%';
    indicator.style.fillOpacity = '1';
    indicator.style.mixBlendMode = 'normal';
    group.appendChild(indicator);
  });
}

function scheduleHighlightOverlays(
  container: HTMLElement | null,
  commentedHighlightIds: Set<string>,
  commentIconTemplate: HTMLElement | null,
  targetLineHeight: number,
  targetBlendMode: string,
) {
  if (!container) return () => undefined;
  let secondFrame = 0;
  const firstFrame = window.requestAnimationFrame(() => {
    secondFrame = window.requestAnimationFrame(() => {
      syncHighlightOverlays(
        container,
        commentedHighlightIds,
        commentIconTemplate,
        targetLineHeight,
        targetBlendMode,
      );
    });
  });
  const timer = window.setTimeout(() => {
    syncHighlightOverlays(
      container,
      commentedHighlightIds,
      commentIconTemplate,
      targetLineHeight,
      targetBlendMode,
    );
  }, 150);
  return () => {
    window.cancelAnimationFrame(firstFrame);
    window.cancelAnimationFrame(secondFrame);
    window.clearTimeout(timer);
  };
}

function hasActiveTextSelection(selection: Selection | null | undefined) {
  return Boolean(selection && !selection.isCollapsed && selection.toString().trim().length >= 2);
}

type PageTurnDirection = 'next' | 'prev';
interface SwipeStart {
  pointerId: number;
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
    performance.now() - start.startedAt > 1200
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

function applyReaderTheme(rendition: Rendition, preferences: ReaderPreferences) {
  const style = resolveReaderStyle(preferences);
  const textureStyle = getReaderTextureStyle(style.texture, style.isDark);
  const fontFamily = READER_FONT_STACKS[style.fontFamily];
  const textElements = 'body, body *';
  rendition.themes.register('learning-center-reader', {
    'html, body': {
      color: `${style.textColor} !important`,
      'background-color': `${style.paperColor} !important`,
      'background-image': `${textureStyle.backgroundImage} !important`,
      'background-size': `${textureStyle.backgroundSize} !important`,
      'background-position': `${textureStyle.backgroundPosition} !important`,
      'background-blend-mode': `${textureStyle.backgroundBlendMode} !important`,
      'color-scheme': style.isDark ? 'dark' : 'light',
      'overscroll-behavior-x': 'contain',
      'touch-action': 'pan-y',
    },
    body: {
      'box-sizing': 'border-box !important',
      'font-size': `${style.fontSize}px !important`,
      'line-height': `${style.density.lineHeight} !important`,
      'letter-spacing': `${style.density.letterSpacing} !important`,
      padding: `0 ${style.density.pagePadding} !important`,
    },
    [textElements]: {
      color: `${style.textColor} !important`,
      'font-family': `${fontFamily} !important`,
    },
    'body > div, section, article, main': { 'background-color': 'transparent !important' },
    'p, li': {
      'line-height': `${style.density.lineHeight} !important`,
      'margin-bottom': `${style.density.paragraphSpacing}em !important`,
    },
    a: { color: `${style.accentColor} !important` },
    blockquote: {
      color: `${style.mutedTextColor} !important`,
      'border-left-color': `${style.accentColor} !important`,
    },
    '::selection': { background: `${style.highlightColor} !important` },
    'img, svg': { 'max-width': '100% !important' },
  });
  rendition.themes.select('learning-center-reader');
}

function renditionHasReadableText(rendition: Rendition) {
  const contents = rendition.getContents() as unknown as Contents[];
  return contents.some((content) => (content.document.body?.innerText.trim().length ?? 0) > 1);
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
    const handleSelectionChange = () => {
      const selection = window.getSelection();
      const selectionIsInsideReader = selection?.anchorNode && readerRootRef.current?.contains(selection.anchorNode);
      if (!hasActiveTextSelection(selection) || !selectionIsInsideReader) onSelection(null);
    };
    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, [onSelection]);

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

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    onContentInteraction();
    if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0) || isSwipeBlockedTarget(event.target)) {
      swipeStartRef.current = null;
      return;
    }
    swipeStartRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      startedAt: performance.now(),
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = swipeStartRef.current;
    if (!start || start.pointerId !== event.pointerId) return;
    swipeStartRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
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
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => { swipeStartRef.current = null; }}
    >
      <article style={{
        fontSize: readerStyle.fontSize,
        lineHeight: readerStyle.density.lineHeight,
        letterSpacing: readerStyle.density.letterSpacing,
        fontFamily: READER_FONT_STACKS[readerStyle.fontFamily],
        paddingLeft: readerStyle.density.pagePadding,
        paddingRight: readerStyle.density.pagePadding,
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

function EpubReader({
  book,
  preferences,
  highlights,
  onLocationChange,
  onSelection,
  onHighlightClick,
  onContentInteraction,
  controllerRef,
}: ReaderSurfaceProps & { controllerRef: React.Ref<ReaderSurfaceHandle> }) {
  const readerStyle = resolveReaderStyle(preferences);
  const containerRef = useRef<HTMLDivElement>(null);
  const bookRef = useRef<EpubBook | null>(null);
  const renditionRef = useRef<Rendition | null>(null);
  const commentIconTemplateRef = useRef<HTMLSpanElement>(null);
  const appliedHighlightCfisRef = useRef<Map<string, string>>(new Map());
  const commentedHighlightIdsRef = useRef<Set<string>>(new Set());
  const currentCfiRef = useRef(book.currentCfi);
  const pageTurnTransitionRef = useRef<ViewTransition | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('请返回书架后重新导入这个 EPUB');
  const onLocationRef = useRef(onLocationChange);
  const onSelectionRef = useRef(onSelection);
  const onHighlightClickRef = useRef(onHighlightClick);
  const onContentInteractionRef = useRef(onContentInteraction);
  const preferencesRef = useRef(preferences);

  useEffect(() => { onLocationRef.current = onLocationChange; }, [onLocationChange]);
  useEffect(() => { onSelectionRef.current = onSelection; }, [onSelection]);
  useEffect(() => { onHighlightClickRef.current = onHighlightClick; }, [onHighlightClick]);
  useEffect(() => { onContentInteractionRef.current = onContentInteraction; }, [onContentInteraction]);
  useEffect(() => { preferencesRef.current = preferences; }, [preferences]);

  const syncCurrentHighlightOverlays = () => {
    const container = containerRef.current;
    if (!container) return;
    const currentPreferences = preferencesRef.current;
    syncHighlightOverlays(
      container,
      commentedHighlightIdsRef.current,
      commentIconTemplateRef.current,
      getHighlightLineHeight(currentPreferences),
      getHighlightBlendMode(currentPreferences),
    );
  };

  const turnEpubPage = (direction: PageTurnDirection) => {
    const rendition = renditionRef.current;
    if (!rendition) return;
    const errorMessage = direction === 'next'
      ? '无法翻到下一页，请尝试从目录跳转'
      : '无法翻到上一页，请尝试从目录跳转';
    const performPageTurn = () => (direction === 'next' ? rendition.next() : rendition.prev());
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion || typeof document.startViewTransition !== 'function') {
      void performPageTurn().catch(() => setErrorMessage(errorMessage));
      return;
    }

    pageTurnTransitionRef.current?.skipTransition();
    document.documentElement.dataset.readerPageTurn = direction;
    try {
      const transition = document.startViewTransition(performPageTurn);
      pageTurnTransitionRef.current = transition;
      void transition.updateCallbackDone.catch(() => {
        setErrorMessage(errorMessage);
      });
      void transition.finished
        .catch(() => undefined)
        .finally(() => {
          if (pageTurnTransitionRef.current !== transition) return;
          pageTurnTransitionRef.current = null;
          delete document.documentElement.dataset.readerPageTurn;
        });
    } catch {
      delete document.documentElement.dataset.readerPageTurn;
      void performPageTurn().catch(() => setErrorMessage(errorMessage));
    }
  };

  useImperativeHandle(controllerRef, () => ({
    next: () => turnEpubPage('next'),
    prev: () => turnEpubPage('prev'),
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
    let locationsReady = false;
    let resizeObserver: ResizeObserver | null = null;
    let resizeTimer: number | null = null;
    let lastWidth = 0;
    let lastHeight = 0;
    let wheelContainer: HTMLDivElement | null = null;
    const selectionDocuments = new Set<Document>();
    const wheelSwipeState = createWheelSwipeState();
    const handleSelectionChange = (event: Event) => {
      const selectionDocument = event.currentTarget as Document;
      if (!hasActiveTextSelection(selectionDocument.defaultView?.getSelection())) {
        onSelectionRef.current(null);
      }
    };
    const handleContentPointerDown = (event: PointerEvent) => {
      onContentInteractionRef.current();
    };
    const handleContentWheel = (event: WheelEvent) => {
      const eventTarget = event.target as Node | null;
      const selectionDocument = eventTarget?.ownerDocument;
      if (
        isSwipeBlockedTarget(event.target)
        || hasActiveTextSelection(selectionDocument?.defaultView?.getSelection())
      ) return;
      const result = getWheelPageTurn(wheelSwipeState, event);
      if (result.shouldPreventDefault && event.cancelable) event.preventDefault();
      if (result.direction) {
        onContentInteractionRef.current();
        turnEpubPage(result.direction);
      }
    };
    const watchSelection = (contents: Contents) => {
      const selectionDocument = contents.document;
      if (selectionDocuments.has(selectionDocument)) return;
      selectionDocuments.add(selectionDocument);
      selectionDocument.addEventListener('selectionchange', handleSelectionChange);
      selectionDocument.addEventListener('pointerdown', handleContentPointerDown);
      selectionDocument.addEventListener('wheel', handleContentWheel, { passive: false });
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
        manager: 'continuous',
        snap: {
          duration: 180,
          minVelocity: 0.12,
          minDistance: 16,
        },
      });
      renditionRef.current = rendition;
      wheelContainer = containerRef.current;
      wheelContainer.addEventListener('wheel', handleContentWheel, { passive: false });
      applyReaderTheme(rendition, preferencesRef.current);
      rendition.hooks.content.register((contents: Contents) => {
        void ensureReaderFontStylesheet(
          contents.document,
          resolveReaderStyle(preferencesRef.current).fontFamily,
        );
        watchSelection(contents);
      });

      rendition.on('relocated', (location: Location) => {
        const cfi = location.start.cfi;
        currentCfiRef.current = cfi;
        const locationCount = locationsReady ? epubBook.locations.length() : 0;
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

      rendition.on('keyup', (event: KeyboardEvent) => {
        if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
        if (isReaderKeyboardEditingTarget(event.target)) return;
        if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
          event.preventDefault();
          turnEpubPage('prev');
        } else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
          event.preventDefault();
          turnEpubPage('next');
        }
      });

      rendition.on('rendered', () => {
        redrawHighlightPanes(rendition, syncCurrentHighlightOverlays);
      });

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
            redrawHighlightPanes(rendition, syncCurrentHighlightOverlays);
          }, 90);
        });
        resizeObserver.observe(container);
      }
      setStatus('ready');
      void epubBook.locations
        .generate(1200)
        .then(() => {
          if (disposed) return;
          locationsReady = true;
          return rendition.reportLocation();
        })
        .catch(() => {
          if (disposed) return undefined;
          locationsReady = epubBook.locations.length() > 0;
          return rendition.reportLocation().catch(() => undefined);
        });
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
        selectionDocument.removeEventListener('pointerdown', handleContentPointerDown);
        selectionDocument.removeEventListener('wheel', handleContentWheel);
      });
      selectionDocuments.clear();
      wheelContainer?.removeEventListener('wheel', handleContentWheel);
      pageTurnTransitionRef.current?.skipTransition();
      pageTurnTransitionRef.current = null;
      delete document.documentElement.dataset.readerPageTurn;
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
      commentedHighlightIdsRef.current.clear();
      if (containerRef.current) containerRef.current.innerHTML = '';
    };
  }, [book.id]);

  useEffect(() => {
    const rendition = renditionRef.current;
    if (!rendition) return;
    applyReaderTheme(rendition, preferences);
    redrawHighlightPanes(rendition, syncCurrentHighlightOverlays);
    const selectedFont = resolveReaderStyle(preferences).fontFamily;
    const contents = rendition.getContents() as unknown as Contents[];
    void Promise.all(contents.map(async (content) => {
      await ensureReaderFontStylesheet(content.document, selectedFont);
      await content.document.fonts?.ready;
    })).then(() => {
      if (resolveReaderStyle(preferencesRef.current).fontFamily !== selectedFont) return;
      redrawHighlightPanes(rendition, syncCurrentHighlightOverlays);
      void rendition.reportLocation().catch(() => undefined);
    });
  }, [preferences.customStyle, preferences.theme, status]);

  useLayoutEffect(() => {
    const rendition = renditionRef.current;
    if (!rendition) return;
    const resolvedStyle = resolveReaderStyle(preferences);
    const highlightColor = resolvedStyle.highlightColor;
    const highlightBlendMode = resolvedStyle.isDark ? 'screen' : 'multiply';
    const getHighlightStyleSignature = (highlightId: string) => (
      `${highlightId}:${highlightColor}:${highlightBlendMode}`
    );
    const desiredHighlights = new Map(highlights.map((highlight) => [highlight.cfi, highlight]));
    const commentedHighlightIds = new Set(
      highlights.filter((highlight) => highlight.comment?.trim()).map((highlight) => highlight.id),
    );
    commentedHighlightIdsRef.current = commentedHighlightIds;
    const appliedHighlights = appliedHighlightCfisRef.current;

    appliedHighlights.forEach((appliedStyle, cfi) => {
      const desiredHighlight = desiredHighlights.get(cfi);
      if (desiredHighlight && appliedStyle === getHighlightStyleSignature(desiredHighlight.id)) return;
      try {
        rendition.annotations.remove(cfi, 'highlight');
      } catch {
        // The rendition may already have unloaded this annotation.
      }
      appliedHighlights.delete(cfi);
    });

    desiredHighlights.forEach((highlight, cfi) => {
      const highlightStyleSignature = getHighlightStyleSignature(highlight.id);
      if (appliedHighlights.get(cfi) === highlightStyleSignature) return;
      try {
        rendition.annotations.highlight(
          cfi,
          { highlightId: highlight.id },
          (event: Event) => {
            const target = event.currentTarget;
            if (!(target instanceof Element)) return;
            const rect = target.getBoundingClientRect();
            onHighlightClickRef.current({
              highlightId: highlight.id,
              rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
            });
          },
          'reader-highlight',
          {
            fill: highlightColor,
            'fill-opacity': '1',
            'mix-blend-mode': 'normal',
            opacity: '0',
          },
        );
        appliedHighlights.set(cfi, highlightStyleSignature);
      } catch {
        // Invalid CFIs from a changed file are ignored without blocking reading.
      }
    });
    if (containerRef.current) {
      syncHighlightOverlays(
        containerRef.current,
        commentedHighlightIds,
        commentIconTemplateRef.current,
        getHighlightLineHeight(preferences),
        highlightBlendMode,
      );
    }
    return scheduleHighlightOverlays(
      containerRef.current,
      commentedHighlightIds,
      commentIconTemplateRef.current,
      getHighlightLineHeight(preferences),
      highlightBlendMode,
    );
  }, [highlights, preferences.customStyle, preferences.theme, status]);

  const epubTextureStyle = getReaderTextureStyle(readerStyle.texture, readerStyle.isDark);
  const epubSurfaceStyle = {
    '--reader-paper-color': readerStyle.paperColor,
    '--reader-color-scheme': readerStyle.isDark ? 'dark' : 'light',
    '--reader-highlight-color': readerStyle.highlightColor,
    '--reader-highlight-icon-color': readerStyle.textColor,
    '--reader-texture-image': epubTextureStyle.backgroundImage,
    '--reader-texture-size': epubTextureStyle.backgroundSize,
    '--reader-texture-position': epubTextureStyle.backgroundPosition,
    '--reader-texture-blend-mode': epubTextureStyle.backgroundBlendMode,
  } as CSSProperties;

  return (
    <div
      className="epub-reader-wrap"
      style={epubSurfaceStyle}
      onPointerDown={onContentInteraction}
    >
      <span ref={commentIconTemplateRef} className="reader-comment-icon-template" aria-hidden="true">
        <IconComment size="large" />
      </span>
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
