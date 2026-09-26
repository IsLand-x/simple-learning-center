import type { WheelSwipeState } from './model/demoReaderModel';
import {
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
import { getDemoContent } from '../../../../util/fixtures/demo';
import { flattenToc } from './model/readerSurfaceModel';
import { ensureReaderFontStylesheet } from '../../../../util/reading/readerFonts';
import { createReaderTextSelectionCursor } from '../../../../util/reading/readerTextCursor';
import { getReaderTextureStyle, resolveReaderStyle } from '../../../../util/reading/readerThemes';
import type { ReaderSurfaceHandle, ReaderSurfaceProps } from './model/readerSurfaceTypes';
import {
  getDemoScrollRatio,
  hasActiveTextSelection,
  type PageTurnDirection,
  type SwipeStart,
  isSwipeBlockedTarget,
  getSwipePageTurn,
  createWheelSwipeState,
  getWheelPageTurn,
} from './model/demoReaderModel';

export function useDemoReader({
  book,
  compactLayout,
  preferences,
  highlights,
  onSelection,
  onContentInteraction,
  onCenterTap,
  controllerRef,
  onLocationChange,
}: ReaderSurfaceProps & { controllerRef: React.Ref<ReaderSurfaceHandle> }) {
  const readerRootRef = useRef<HTMLDivElement>(null);
  const chapters = useMemo(() => flattenToc(book.toc), [book.toc]);
  const initialIndex = Math.max(
    0,
    chapters.findIndex((item) => item.label === book.currentChapter),
  );
  const [chapterIndex, setChapterIndex] = useState(initialIndex);
  const chapterIndexRef = useRef(chapterIndex);
  chapterIndexRef.current = chapterIndex;
  const chapter = chapters[chapterIndex] ?? chapters[0];
  const content = getDemoContent(chapter?.href ?? 'chapter-5');
  const chapterHighlights = useMemo(
    () =>
      highlights.filter((highlight) => highlight.cfi.startsWith(`demo:${chapter?.href ?? ''}:`)),
    [chapter?.href, highlights],
  );
  const readerStyle = resolveReaderStyle(preferences);
  const lastLocationCfiRef = useRef(book.currentCfi);
  const pendingDemoTargetRef = useRef<string | null>(null);
  const [demoNavigationRevision, setDemoNavigationRevision] = useState(0);
  const swipeStartRef = useRef<SwipeStart | null>(null);
  const suppressCenterTapUntilRef = useRef(0);
  const wheelSwipeRef = useRef<WheelSwipeState>(createWheelSwipeState());
  const reportCurrentSelection = useCallback(
    (fallbackX = 0, fallbackY = 0) => {
      const selection = window.getSelection();
      const selectionIsInsideReader =
        selection?.anchorNode && readerRootRef.current?.contains(selection.anchorNode);
      const text = selection?.toString().trim();
      if (
        !hasActiveTextSelection(selection) ||
        !selectionIsInsideReader ||
        !selection?.rangeCount ||
        !text
      ) {
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
    },
    [chapter?.href, onSelection],
  );
  const turnDemoPage = useCallback(
    (direction: PageTurnDirection) => {
      const currentIndex = chapterIndexRef.current;
      const nextIndex =
        direction === 'next'
          ? Math.min(chapters.length - 1, currentIndex + 1)
          : Math.max(0, currentIndex - 1);
      if (nextIndex === currentIndex) return;
      setChapterIndex(nextIndex);
    },
    [chapters.length],
  );
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
      if (isSwipeBlockedTarget(event.target) || hasActiveTextSelection(window.getSelection()))
        return;
      const result = getWheelPageTurn(wheelSwipeRef.current, event);
      if (result.shouldPreventDefault && event.cancelable) event.preventDefault();
      if (result.direction) {
        onContentInteraction();
        turnDemoPage(result.direction);
      }
    };
    readerRoot.addEventListener('wheel', handleWheel, { passive: false });
    return () => readerRoot.removeEventListener('wheel', handleWheel);
  }, [onContentInteraction, turnDemoPage]);
  useImperativeHandle(
    controllerRef,
    () => ({
      next: () => turnDemoPage('next'),
      prev: () => turnDemoPage('prev'),
      display: (target) => {
        const normalized = target
          .replace(/^demo:/, '')
          .split(':')[0]
          .split('#')[0];
        const index = chapters.findIndex((item) => item.href.split('#')[0] === normalized);
        if (index >= 0) {
          pendingDemoTargetRef.current = target;
          setChapterIndex(index);
          setDemoNavigationRevision((revision) => revision + 1);
        }
      },
      clearSelection: () => window.getSelection()?.removeAllRanges(),
      getCurrentText: () => [content.heading, ...content.paragraphs].join('\n\n'),
    }),
    [chapters, content.heading, content.paragraphs, turnDemoPage],
  );
  useLayoutEffect(() => {
    const readerRoot = readerRootRef.current;
    if (!readerRoot || !chapter) return;
    const savedRatio = getDemoScrollRatio(
      pendingDemoTargetRef.current ?? lastLocationCfiRef.current,
      chapter.href,
    );
    pendingDemoTargetRef.current = null;
    let restored = false;
    let currentRatio = savedRatio;
    let saveTimer: number | null = null;

    const reportLocation = (ratio = currentRatio) => {
      if (!restored) return;
      const progress = Math.max(
        0,
        Math.min(100, ((chapterIndex + ratio) / Math.max(1, chapters.length)) * 100),
      );
      const cfi = `demo:${chapter.href}:scroll:${ratio.toFixed(6)}`;
      lastLocationCfiRef.current = cfi;
      onLocationChange({
        cfi,
        href: chapter.href,
        progress,
        page: book.totalPages
          ? Math.max(1, Math.round((book.totalPages * progress) / 100))
          : undefined,
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
  }, [
    book.totalPages,
    chapter,
    chapterIndex,
    chapters.length,
    demoNavigationRevision,
    onLocationChange,
  ]);
  const handleMouseUp = (event: MouseEvent<HTMLElement>) => {
    reportCurrentSelection(event.clientX, event.clientY);
  };
  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    onContentInteraction();
    if (
      !event.isPrimary ||
      (event.pointerType === 'mouse' && event.button !== 0) ||
      isSwipeBlockedTarget(event.target) ||
      hasActiveTextSelection(window.getSelection())
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
    if (direction) {
      suppressCenterTapUntilRef.current = performance.now() + 450;
      turnDemoPage(direction);
    }
  };
  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (hasActiveTextSelection(window.getSelection())) {
      swipeStartRef.current = null;
      suppressCenterTapUntilRef.current = performance.now() + 450;
      return;
    }
    const start = swipeStartRef.current;
    if (
      start &&
      start.pointerId === event.pointerId &&
      (Math.abs(event.clientX - start.x) >= 8 || Math.abs(event.clientY - start.y) >= 8)
    )
      suppressCenterTapUntilRef.current = performance.now() + 450;
  };
  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    if (
      !compactLayout ||
      performance.now() < suppressCenterTapUntilRef.current ||
      isSwipeBlockedTarget(event.target) ||
      hasActiveTextSelection(window.getSelection())
    )
      return;
    onCenterTap();
  };
  const readerCssVariables = {
    '--reader-muted-color': readerStyle.mutedTextColor,
    '--reader-accent-color': readerStyle.accentColor,
    '--reader-callout-color': readerStyle.calloutColor,
    '--reader-highlight-color': readerStyle.highlightColor,
    '--reader-highlight-icon-color': readerStyle.textColor,
    '--reader-text-selection-cursor': compactLayout
      ? 'text'
      : createReaderTextSelectionCursor(readerStyle),
    '--reader-highlight-vertical-padding': `${Math.max(
      0,
      (readerStyle.fontSize * readerStyle.density.lineHeight - readerStyle.fontSize) / 2,
    )}px`,
    '--reader-paragraph-spacing': `${readerStyle.density.paragraphSpacing}em`,
  } as CSSProperties;
  const readerTextureStyle = getReaderTextureStyle(readerStyle.texture, readerStyle.isDark);
  return {
    readerRootRef,
    readerCssVariables,
    readerStyle,
    readerTextureStyle,
    handleMouseUp,
    handleClick,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    swipeStartRef,
    content,
    chapter,
    chapterHighlights,
  };
}
