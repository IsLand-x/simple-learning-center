import { useCallback, useEffect, useImperativeHandle, useRef, useState, type CSSProperties, type Ref } from 'react';
import { IconComment } from '@douyinfe/semi-icons';
import { Empty, Spin, Typography } from '@douyinfe/semi-ui';
import type {
  FoliateNavigationTarget,
  FoliateRelocateDetail,
  FoliateTocItem,
  View as FoliateView,
} from 'foliate-js/view.js';
import type { FoliateOverlayRect } from 'foliate-js/overlayer.js';
import { loadEpubFile } from '../lib/epubStorage';
import {
  applyFoliateReaderLayout,
  applyFoliateReaderStyle,
  configureFoliateReader,
  createFoliateAnnotation,
  createFoliateView,
  drawFoliateHighlight,
  expandFoliateHighlightRects,
  getFoliateContents,
  prepareFoliateBookForBrowser,
  rangeToViewportRect,
  type ReaderFoliateAnnotation,
} from '../lib/foliateReader';
import { ensureReaderFontStylesheet } from '../lib/readerFonts';
import {
  createMobileTouchGesture,
  isReaderCenterTap,
  markMobileTouchSelection,
  MOBILE_TEXT_SELECTION_HOLD_MS,
  resolveMobileTouchMove,
  shouldPreserveMobileTextSelection,
  type MobileTouchGesture,
} from '../lib/readerGestures';
import { getReaderTextureStyle, resolveReaderStyle } from '../lib/readerThemes';
import type { HighlightItem, ReaderPreferences } from '../types';
import type { ReaderSurfaceHandle, ReaderSurfaceProps } from './ReaderSurface';

const { Text } = Typography;
const TRACKPAD_GESTURE_IDLE_MS = 260;
const TRACKPAD_SNAP_DELAY_MS = 72;
const FOLIATE_NAVIGATION_RETRY_MS = 360;

interface FoliateLoadDetail {
  doc: Document;
  index: number;
}

interface FoliateDrawAnnotationDetail {
  annotation: ReaderFoliateAnnotation;
  draw: (
    draw: (rects: FoliateOverlayRect[]) => SVGElement,
    options?: Record<string, unknown>,
  ) => void;
}

interface FoliateShowAnnotationDetail {
  value: string;
  range: Range;
}

interface TrackpadState {
  lastEventAt: number;
  velocityX: number;
  velocityY: number;
  snapping: boolean;
  snapTimer: number | null;
}

function flattenFoliateToc(items: FoliateTocItem[]): FoliateTocItem[] {
  return items.flatMap((item) => [item, ...flattenFoliateToc(item.subitems ?? [])]);
}

function normalizeReaderHref(href: string) {
  try {
    return decodeURI(href).replace(/^\.\//, '').replace(/^\//, '');
  } catch {
    return href.replace(/^\.\//, '').replace(/^\//, '');
  }
}

function hrefsMatch(left: string, right: string) {
  const normalizedLeft = normalizeReaderHref(left);
  const normalizedRight = normalizeReaderHref(right);
  return normalizedLeft === normalizedRight
    || normalizedLeft.endsWith(`/${normalizedRight}`)
    || normalizedRight.endsWith(`/${normalizedLeft}`);
}

function normalizeTocLabel(label: string) {
  return label.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

function canNavigateTo(view: FoliateView, target: string | number | undefined) {
  if (target === undefined || target === '') return false;
  const resolved = view.resolveNavigation(target);
  return Boolean(
    resolved
    && Number.isInteger(resolved.index)
    && resolved.index >= 0
    && resolved.index < view.book.sections.length,
  );
}

function resolveFoliateTarget(view: FoliateView, target: string, label?: string) {
  if (canNavigateTo(view, target)) return target;
  const flattenedToc = flattenFoliateToc(view.book.toc ?? []);
  const tocTarget = flattenedToc.find((item) => hrefsMatch(item.href, target))?.href
    ?? (label
      ? flattenedToc.find((item) => normalizeTocLabel(item.label) === normalizeTocLabel(label))?.href
      : undefined);
  if (tocTarget && canNavigateTo(view, tocTarget)) return tocTarget;
  return undefined;
}

async function getFoliateAnchorPosition(
  view: FoliateView,
  resolved: FoliateNavigationTarget,
): Promise<'before' | 'visible' | 'after' | 'unknown'> {
  if (typeof resolved.anchor !== 'function') return 'unknown';
  await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
  const content = getFoliateContents(view).find((item) => item.index === resolved.index);
  if (!content) return 'unknown';
  const anchor = resolved.anchor(content.doc);
  if (!anchor || typeof anchor === 'number' || typeof anchor.getBoundingClientRect !== 'function') return 'unknown';
  const targetRect = anchor.getBoundingClientRect();
  const frameRect = content.doc.defaultView?.frameElement?.getBoundingClientRect();
  if (!frameRect) return 'unknown';
  const readerRect = view.getBoundingClientRect();
  const left = frameRect.left + targetRect.left;
  const right = frameRect.left + targetRect.right;
  const top = frameRect.top + targetRect.top;
  const bottom = frameRect.top + targetRect.bottom;
  if (right <= readerRect.left + 1 || bottom <= readerRect.top + 1) {
    return 'before';
  }
  if (left >= readerRect.right - 1 || top >= readerRect.bottom - 1) return 'after';
  return 'visible';
}

async function ensureFoliateAnchorIsVisible(view: FoliateView, resolved: FoliateNavigationTarget) {
  const position = await getFoliateAnchorPosition(view, resolved);
  if (position === 'before') await view.prev();
  else if (position === 'after') await view.next();
  return position;
}

async function navigateToFoliateTarget(view: FoliateView, target: string) {
  let resolved = await view.goTo(target);
  if (!resolved) return false;
  const firstPosition = await getFoliateAnchorPosition(view, resolved);
  if (firstPosition === 'before' || firstPosition === 'after') {
    await new Promise<void>((resolve) => window.setTimeout(resolve, FOLIATE_NAVIGATION_RETRY_MS));
    resolved = await view.goTo(target) ?? resolved;
  }
  await ensureFoliateAnchorIsVisible(view, resolved);
  return true;
}

function hasActiveTextSelection(selection: Selection | null | undefined) {
  return Boolean(selection && selection.rangeCount > 0 && !selection.isCollapsed);
}

function findFoliateHighlightAtPoint({
  view,
  doc,
  sectionIndex,
  highlights,
  preferences,
  x,
  y,
}: {
  view: FoliateView;
  doc: Document;
  sectionIndex: number;
  highlights: HighlightItem[];
  preferences: ReaderPreferences;
  x: number;
  y: number;
}) {
  const style = resolveReaderStyle(preferences);
  const targetLineHeight = style.fontSize * style.density.lineHeight;
  for (const highlight of highlights) {
    const resolved = view.resolveNavigation(highlight.cfi);
    if (resolved?.index !== sectionIndex || typeof resolved.anchor !== 'function') continue;
    const anchor = resolved.anchor(doc);
    if (!anchor || typeof anchor === 'number') continue;
    let range: Range;
    if (typeof (anchor as Range).cloneRange === 'function') {
      range = anchor as Range;
    } else {
      range = doc.createRange();
      range.selectNodeContents(anchor as Node);
    }
    const rects = expandFoliateHighlightRects(
      Array.from(range.getClientRects(), (rect) => ({
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      })),
      targetLineHeight,
    );
    if (rects.some((rect) => x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom)) {
      return { highlight, range };
    }
  }
  return undefined;
}

function isBlockedInteractionTarget(target: EventTarget | null) {
  const element = target as Element | null;
  return Boolean(
    element
    && typeof element.closest === 'function'
    && element.closest('a, button, input, textarea, select, [contenteditable="true"], [role="button"], [role="link"], [role="slider"]'),
  );
}

function isEditingTarget(target: EventTarget | null) {
  const element = target as Element | null;
  return Boolean(
    element
    && typeof element.closest === 'function'
    && element.closest('input, textarea, select, [contenteditable="true"], [role="textbox"], [role="combobox"], [role="listbox"], [role="menu"], [role="slider"]'),
  );
}

function normalizedWheelDelta(event: WheelEvent) {
  const multiplier = event.deltaMode === WheelEvent.DOM_DELTA_LINE
    ? 16
    : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
      ? Math.max(1, event.view?.innerWidth ?? window.innerWidth)
      : 1;
  return {
    x: event.deltaX * multiplier,
    y: event.deltaY * multiplier,
  };
}

function annotationSignature(highlight: HighlightItem, preferences: ReaderPreferences) {
  const style = resolveReaderStyle(preferences);
  return [highlight.id, highlight.comment ?? '', style.highlightColor, style.textColor, style.isDark].join(':');
}

export function FoliateEpubReader({
  book,
  compactLayout,
  preferences,
  highlights,
  onLocationChange,
  onSelection,
  onHighlightClick,
  onContentInteraction,
  onCenterTap,
  controllerRef,
}: ReaderSurfaceProps & { controllerRef: Ref<ReaderSurfaceHandle> }) {
  const readerStyle = resolveReaderStyle(preferences);
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<FoliateView | null>(null);
  const navigationQueueRef = useRef<Promise<void>>(Promise.resolve());
  const commentIconTemplateRef = useRef<HTMLSpanElement>(null);
  const appliedAnnotationsRef = useRef<Map<string, string>>(new Map());
  const highlightsRef = useRef(highlights);
  const compactLayoutRef = useRef(compactLayout);
  const preferencesRef = useRef(preferences);
  const onLocationRef = useRef(onLocationChange);
  const onSelectionRef = useRef(onSelection);
  const onHighlightClickRef = useRef(onHighlightClick);
  const onContentInteractionRef = useRef(onContentInteraction);
  const onCenterTapRef = useRef(onCenterTap);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('请返回书架后重新导入这个 EPUB');

  useEffect(() => { highlightsRef.current = highlights; }, [highlights]);
  useEffect(() => { compactLayoutRef.current = compactLayout; }, [compactLayout]);
  useEffect(() => { preferencesRef.current = preferences; }, [preferences]);
  useEffect(() => { onLocationRef.current = onLocationChange; }, [onLocationChange]);
  useEffect(() => { onSelectionRef.current = onSelection; }, [onSelection]);
  useEffect(() => { onHighlightClickRef.current = onHighlightClick; }, [onHighlightClick]);
  useEffect(() => { onContentInteractionRef.current = onContentInteraction; }, [onContentInteraction]);
  useEffect(() => { onCenterTapRef.current = onCenterTap; }, [onCenterTap]);

  const syncVisibleAnnotations = useCallback(async (view: FoliateView, sectionIndex: number) => {
    const desired = new Map<string, { highlight: HighlightItem; signature: string }>();
    highlightsRef.current.forEach((highlight) => {
      const target = view.resolveNavigation(highlight.cfi);
      if (target?.index !== sectionIndex) return;
      desired.set(highlight.cfi, {
        highlight,
        signature: annotationSignature(highlight, preferencesRef.current),
      });
    });

    for (const [cfi, signature] of appliedAnnotationsRef.current) {
      if (desired.get(cfi)?.signature === signature) continue;
      await view.deleteAnnotation({ value: cfi }).catch(() => undefined);
      appliedAnnotationsRef.current.delete(cfi);
    }

    for (const [cfi, { highlight, signature }] of desired) {
      if (appliedAnnotationsRef.current.get(cfi) === signature) continue;
      await view.addAnnotation(createFoliateAnnotation(highlight)).catch(() => undefined);
      appliedAnnotationsRef.current.set(cfi, signature);
    }
  }, []);

  const enqueueNavigation = useCallback((
    operation: (view: FoliateView) => Promise<void>,
    errorMessage: string,
  ) => {
    const queuedView = viewRef.current;
    if (!queuedView) return;
    const queued = navigationQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        if (viewRef.current === queuedView) await operation(queuedView);
      });
    navigationQueueRef.current = queued.catch(() => setErrorMessage(errorMessage));
  }, []);

  const turnPage = useCallback((direction: 'next' | 'prev') => {
    viewRef.current?.deselect();
    onSelectionRef.current(null);
    const message = direction === 'next'
      ? '无法翻到下一页，请尝试从目录跳转'
      : '无法翻到上一页，请尝试从目录跳转';
    enqueueNavigation(async (view) => {
      await (direction === 'next' ? view.next() : view.prev());
    }, message);
  }, [enqueueNavigation]);

  useImperativeHandle(controllerRef, () => ({
    next: () => turnPage('next'),
    prev: () => turnPage('prev'),
    display: (target, label) => {
      viewRef.current?.deselect();
      onSelectionRef.current(null);
      enqueueNavigation(async (view) => {
        const foliateTarget = resolveFoliateTarget(view, target, label);
        if (!foliateTarget || !await navigateToFoliateTarget(view, foliateTarget)) {
          throw new Error('无法定位到所选内容');
        }
      }, '无法定位到所选内容');
    },
    clearSelection: () => viewRef.current?.deselect(),
    getCurrentText: () => getFoliateContents(viewRef.current)
      .map((content) => content.doc.body?.innerText ?? '')
      .filter(Boolean)
      .join('\n\n'),
  }), [enqueueNavigation, turnPage]);

  useEffect(() => {
    let disposed = false;
    let ownedView: FoliateView | null = null;
    let selectionFrame = 0;
    const documentCleanups = new Map<Document, () => void>();
    const trackpad: TrackpadState = {
      lastEventAt: 0,
      velocityX: 0,
      velocityY: 0,
      snapping: false,
      snapTimer: null,
    };

    const reportSelection = (view: FoliateView, doc: Document, index: number) => {
      window.cancelAnimationFrame(selectionFrame);
      selectionFrame = window.requestAnimationFrame(() => {
        const selection = doc.defaultView?.getSelection();
        const selectedText = selection?.toString().trim() ?? '';
        if (!selection || !hasActiveTextSelection(selection) || !selectedText) {
          onSelectionRef.current(null);
          return;
        }
        const range = selection.getRangeAt(0).cloneRange();
        try {
          onSelectionRef.current({
            text: selectedText.slice(0, 600),
            cfi: view.getCFI(index, range),
            rect: rangeToViewportRect(range),
          });
        } catch {
          onSelectionRef.current(null);
        }
      });
    };

    const handleWheel = (event: WheelEvent) => {
      if (event.ctrlKey || isBlockedInteractionTarget(event.target)) return;
      const selection = (event.target as Node | null)?.ownerDocument?.defaultView?.getSelection();
      if (hasActiveTextSelection(selection)) return;
      const { x, y } = normalizedWheelDelta(event);
      if (Math.abs(x) < 0.35 || Math.abs(x) <= Math.abs(y) * 1.05) return;
      if (event.cancelable) event.preventDefault();
      onContentInteractionRef.current();

      const view = viewRef.current;
      const renderer = view?.renderer;
      if (!renderer?.scrollBy || !renderer.snap) return;
      const now = performance.now();
      const gap = now - trackpad.lastEventAt;
      if (gap > TRACKPAD_GESTURE_IDLE_MS) trackpad.snapping = false;
      trackpad.lastEventAt = now;
      if (trackpad.snapping) return;

      const deltaTime = gap > 0 && gap < 80 ? gap : 16;
      trackpad.velocityX = x / deltaTime;
      trackpad.velocityY = y / deltaTime;
      renderer.scrollBy(x, y);
      if (trackpad.snapTimer) window.clearTimeout(trackpad.snapTimer);
      trackpad.snapTimer = window.setTimeout(() => {
        trackpad.snapTimer = null;
        trackpad.snapping = true;
        renderer.snap?.(trackpad.velocityX, trackpad.velocityY);
      }, TRACKPAD_SNAP_DELAY_MS);
    };

    const handleViewPointerDown = () => onContentInteractionRef.current();

    const handleLoad = (event: Event) => {
      const view = viewRef.current;
      if (!view) return;
      const { doc, index } = (event as CustomEvent<FoliateLoadDetail>).detail;
      if (documentCleanups.has(doc)) return;

      let touchSelectionGesture: MobileTouchGesture | null = null;
      let touchSelectionTimer: number | null = null;
      let touchStartContainerPosition: number | null = null;
      let mobileSelectionLocked = false;
      let suppressCenterTapUntil = 0;
      const hasDocumentSelection = () => hasActiveTextSelection(doc.defaultView?.getSelection());
      const clearTouchSelectionTimer = () => {
        if (touchSelectionTimer !== null) window.clearTimeout(touchSelectionTimer);
        touchSelectionTimer = null;
      };
      const restoreTouchStartPosition = () => {
        if (view.renderer.cancelTouchPaging) view.renderer.cancelTouchPaging();
        else view.renderer.cancelTouchScroll?.();
        if (touchStartContainerPosition !== null) {
          view.renderer.containerPosition = touchStartContainerPosition;
        }
      };
      const handleTouchStartCapture = (touchEvent: TouchEvent) => {
        clearTouchSelectionTimer();
        const touch = touchEvent.touches[0];
        const selectionActive = hasDocumentSelection();
        mobileSelectionLocked = selectionActive;
        touchStartContainerPosition = touchEvent.touches.length === 1
          ? view.renderer.containerPosition
          : null;
        touchSelectionGesture = touchEvent.touches.length === 1 && touch
          ? createMobileTouchGesture({
            startedAt: performance.now(),
            startX: touch.clientX,
            startY: touch.clientY,
            hasSelection: selectionActive,
          })
          : null;
        if (touchSelectionGesture?.intent === 'selection') {
          touchEvent.stopImmediatePropagation();
          return;
        }
        if (touchSelectionGesture) {
          touchSelectionTimer = window.setTimeout(() => {
            if (touchSelectionGesture?.intent === 'pending') {
              markMobileTouchSelection(touchSelectionGesture);
            }
            touchSelectionTimer = null;
          }, MOBILE_TEXT_SELECTION_HOLD_MS);
        }
      };
      const handleSelectStartCapture = (selectionEvent: Event) => {
        if (compactLayoutRef.current || touchSelectionGesture) {
          mobileSelectionLocked = true;
          restoreTouchStartPosition();
          selectionEvent.stopImmediatePropagation();
        }
        markMobileTouchSelection(touchSelectionGesture);
        clearTouchSelectionTimer();
      };
      const handleTouchMoveCapture = (touchEvent: TouchEvent) => {
        const gesture = touchSelectionGesture;
        const touch = touchEvent.touches[0];
        if (!gesture || !touch) return;
        const previousIntent = gesture.intent;
        const intent = resolveMobileTouchMove({
          gesture,
          currentX: touch.clientX,
          currentY: touch.clientY,
          currentTime: performance.now(),
          hasSelection: hasDocumentSelection() || mobileSelectionLocked,
        });
        if (intent === 'selection' && previousIntent !== 'selection') {
          mobileSelectionLocked = true;
          restoreTouchStartPosition();
        }
        if (
          Math.abs(touch.clientX - gesture.startX) >= 8
          || Math.abs(touch.clientY - gesture.startY) >= 8
        ) suppressCenterTapUntil = performance.now() + 450;
        if (intent !== 'pending') suppressCenterTapUntil = performance.now() + 450;
        if (intent !== 'pending') clearTouchSelectionTimer();
        if (intent !== 'page-turn') {
          touchEvent.stopImmediatePropagation();
        }
      };
      const handleTouchEndCapture = (touchEvent: TouchEvent) => {
        const gesture = touchSelectionGesture;
        const shouldKeepSelection = shouldPreserveMobileTextSelection({
          gesture,
          currentTime: performance.now(),
          hasSelection: hasDocumentSelection() || mobileSelectionLocked,
        });
        if (gesture?.intent !== 'pending' || shouldKeepSelection) {
          suppressCenterTapUntil = performance.now() + 450;
        }
        if (shouldKeepSelection) {
          mobileSelectionLocked = true;
          restoreTouchStartPosition();
        }
        touchSelectionGesture = null;
        touchStartContainerPosition = null;
        clearTouchSelectionTimer();
        if (shouldKeepSelection) touchEvent.stopImmediatePropagation();
      };
      const handleTouchCancelCapture = (touchEvent: TouchEvent) => {
        const selectionActive = mobileSelectionLocked || hasDocumentSelection();
        const shouldRebound = touchSelectionGesture?.intent === 'page-turn' && !selectionActive;
        if (touchSelectionGesture?.intent !== 'pending') {
          suppressCenterTapUntil = performance.now() + 450;
        }
        if (selectionActive) restoreTouchStartPosition();
        touchSelectionGesture = null;
        touchStartContainerPosition = null;
        clearTouchSelectionTimer();
        if (selectionActive) touchEvent.stopImmediatePropagation();
        if (shouldRebound) {
          window.requestAnimationFrame(() => view.renderer?.snap?.(0, 0));
        }
      };
      const handleContextMenu = (contextMenuEvent: Event) => contextMenuEvent.preventDefault();

      const handleSelectionChange = (selectionEvent: Event) => {
        const selectionActive = hasDocumentSelection();
        const mobileSelectionActive = compactLayoutRef.current
          || mobileSelectionLocked
          || touchSelectionGesture !== null;
        if (selectionActive) {
          if (mobileSelectionActive) {
            mobileSelectionLocked = true;
            restoreTouchStartPosition();
          }
          markMobileTouchSelection(touchSelectionGesture);
          clearTouchSelectionTimer();
        } else if (!touchSelectionGesture || touchSelectionGesture.intent !== 'selection') {
          mobileSelectionLocked = false;
        }
        reportSelection(view, doc, index);
        if (mobileSelectionActive && selectionActive) {
          // Foliate schedules an automatic prev/next when a selection crosses the
          // visible column. Keep every mobile selectionchange away from that
          // listener, including the delayed events emitted after touchend.
          selectionEvent.stopImmediatePropagation();
        }
      };
      const handlePointerDown = () => onContentInteractionRef.current();
      const handleClick = (mouseEvent: MouseEvent) => {
        if (
          performance.now() < suppressCenterTapUntil
          || isBlockedInteractionTarget(mouseEvent.target)
          || hasActiveTextSelection(doc.defaultView?.getSelection())
        ) return;
        const match = findFoliateHighlightAtPoint({
          view,
          doc,
          sectionIndex: index,
          highlights: highlightsRef.current,
          preferences: preferencesRef.current,
          x: mouseEvent.clientX,
          y: mouseEvent.clientY,
        });
        if (match) {
          onHighlightClickRef.current({
            highlightId: match.highlight.id,
            rect: rangeToViewportRect(match.range),
          });
          return;
        }
        if (!compactLayoutRef.current) return;
        const width = doc.defaultView?.innerWidth ?? doc.documentElement.clientWidth;
        const height = doc.defaultView?.innerHeight ?? doc.documentElement.clientHeight;
        if (isReaderCenterTap({
          x: mouseEvent.clientX,
          y: mouseEvent.clientY,
          width,
          height,
        })) onCenterTapRef.current();
      };
      const handleKeyUp = (keyboardEvent: KeyboardEvent) => {
        if (
          keyboardEvent.defaultPrevented
          || keyboardEvent.metaKey
          || keyboardEvent.ctrlKey
          || keyboardEvent.altKey
          || isEditingTarget(keyboardEvent.target)
        ) return;
        if (keyboardEvent.key === 'ArrowLeft' || keyboardEvent.key === 'ArrowUp') {
          keyboardEvent.preventDefault();
          turnPage('prev');
        } else if (keyboardEvent.key === 'ArrowRight' || keyboardEvent.key === 'ArrowDown') {
          keyboardEvent.preventDefault();
          turnPage('next');
        }
      };
      doc.addEventListener('selectionchange', handleSelectionChange, true);
      doc.addEventListener('selectstart', handleSelectStartCapture, true);
      doc.addEventListener('touchstart', handleTouchStartCapture, { capture: true, passive: true });
      doc.addEventListener('touchmove', handleTouchMoveCapture, { capture: true, passive: true });
      doc.addEventListener('touchend', handleTouchEndCapture, { capture: true, passive: true });
      doc.addEventListener('touchcancel', handleTouchCancelCapture, { capture: true, passive: true });
      doc.addEventListener('contextmenu', handleContextMenu);
      doc.addEventListener('pointerdown', handlePointerDown);
      doc.addEventListener('click', handleClick);
      doc.addEventListener('keyup', handleKeyUp);
      doc.addEventListener('wheel', handleWheel, { passive: false });
      documentCleanups.set(doc, () => {
        clearTouchSelectionTimer();
        doc.removeEventListener('selectionchange', handleSelectionChange, true);
        doc.removeEventListener('selectstart', handleSelectStartCapture, true);
        doc.removeEventListener('touchstart', handleTouchStartCapture, true);
        doc.removeEventListener('touchmove', handleTouchMoveCapture, true);
        doc.removeEventListener('touchend', handleTouchEndCapture, true);
        doc.removeEventListener('touchcancel', handleTouchCancelCapture, true);
        doc.removeEventListener('contextmenu', handleContextMenu);
        doc.removeEventListener('pointerdown', handlePointerDown);
        doc.removeEventListener('click', handleClick);
        doc.removeEventListener('keyup', handleKeyUp);
        doc.removeEventListener('wheel', handleWheel);
      });

      const selectedFont = resolveReaderStyle(preferencesRef.current).fontFamily;
      void ensureReaderFontStylesheet(doc, selectedFont)
        .then(() => doc.fonts?.ready)
        .then(() => {
          if (disposed || resolveReaderStyle(preferencesRef.current).fontFamily !== selectedFont) return;
          applyFoliateReaderStyle(view, preferencesRef.current, compactLayoutRef.current);
        });
    };

    const handleRelocate = (event: Event) => {
      const view = viewRef.current;
      if (!view) return;
      const detail = (event as CustomEvent<FoliateRelocateDetail>).detail;
      const sectionIndex = detail.section?.current ?? getFoliateContents(view)[0]?.index;
      const rawFraction = detail.fraction;
      const progress = typeof rawFraction === 'number' && Number.isFinite(rawFraction)
        ? Math.max(0, Math.min(100, rawFraction * 100))
        : undefined;
      onLocationRef.current({
        cfi: detail.cfi,
        href: detail.tocItem?.href ?? (sectionIndex === undefined ? undefined : view.book.sections[sectionIndex]?.id),
        progress,
        page: detail.location ? detail.location.current + 1 : undefined,
        totalPages: detail.location?.total,
      });
      if (!disposed) setStatus('ready');
    };

    const handleCreateOverlay = (event: Event) => {
      const view = viewRef.current;
      if (!view) return;
      const { index } = (event as CustomEvent<{ index: number }>).detail;
      appliedAnnotationsRef.current.clear();
      void syncVisibleAnnotations(view, index);
    };

    const handleDrawAnnotation = (event: Event) => {
      const { annotation, draw } = (event as CustomEvent<FoliateDrawAnnotationDetail>).detail;
      draw((rects) => drawFoliateHighlight({
        rects,
        annotation,
        preferences: preferencesRef.current,
        iconTemplate: commentIconTemplateRef.current,
      }));
    };

    const handleShowAnnotation = (event: Event) => {
      const { value, range } = (event as CustomEvent<FoliateShowAnnotationDetail>).detail;
      const highlight = highlightsRef.current.find((item) => item.cfi === value);
      if (!highlight) return;
      onHighlightClickRef.current({
        highlightId: highlight.id,
        rect: rangeToViewportRect(range),
      });
    };

    const setup = async () => {
      setStatus('loading');
      setErrorMessage('请返回书架后重新导入这个 EPUB');
      appliedAnnotationsRef.current.clear();
      const data = await loadEpubFile(book.id);
      const host = hostRef.current;
      if (disposed) return;
      if (!data || !host) throw new Error('EPUB 文件不存在');

      const view = createFoliateView();
      ownedView = view;
      viewRef.current = view;
      view.className = 'foliate-reader';
      view.setAttribute('aria-label', `《${book.title}》阅读区`);
      view.addEventListener('load', handleLoad);
      view.addEventListener('relocate', handleRelocate);
      view.addEventListener('create-overlay', handleCreateOverlay);
      view.addEventListener('draw-annotation', handleDrawAnnotation);
      view.addEventListener('show-annotation', handleShowAnnotation);
      view.addEventListener('pointerdown', handleViewPointerDown);
      view.addEventListener('wheel', handleWheel, { passive: false });
      host.replaceChildren(view);

      const file = new File([data], book.fileName || `${book.title}.epub`, {
        type: 'application/epub+zip',
      });
      await view.open(file);
      if (disposed || ownedView !== view || viewRef.current !== view) return;
      prepareFoliateBookForBrowser(view);
      configureFoliateReader(view, preferencesRef.current, compactLayoutRef.current);

      let displayed = false;
      if (book.currentCfi && canNavigateTo(view, book.currentCfi)) {
        try {
          await view.init({ lastLocation: book.currentCfi });
          displayed = getFoliateContents(view).length > 0;
        } catch {
          // A CFI saved by an older renderer may no longer resolve to a valid DOM range.
        }
      }
      if (!displayed) {
        const chapterHref = flattenFoliateToc(view.book.toc ?? [])
          .find((item) => item.label.trim() === book.currentChapter.trim())?.href;
        if (chapterHref && canNavigateTo(view, chapterHref)) {
          try {
            const resolved = await view.goTo(chapterHref);
            if (resolved) await ensureFoliateAnchorIsVisible(view, resolved);
            displayed = getFoliateContents(view).length > 0;
          } catch {
            // Fall through to the first readable spine item.
          }
        }
      }
      if (!displayed) {
        const firstSectionIndex = view.book.sections.findIndex((section) => section.linear !== 'no');
        const targetIndex = firstSectionIndex >= 0 ? firstSectionIndex : 0;
        if (canNavigateTo(view, targetIndex)) {
          await view.goTo(targetIndex);
          displayed = getFoliateContents(view).length > 0;
        }
      }
      if (!displayed) throw new Error('EPUB 中没有可渲染的正文');
      if (!disposed) setStatus('ready');
    };

    void setup().catch((error: unknown) => {
      if (disposed) return;
      setErrorMessage(error instanceof Error && error.message.includes('不存在')
        ? '本地 EPUB 文件不存在，请返回书架后重新导入'
        : '文件可能已损坏或不符合 EPUB 规范，请尝试重新导入');
      setStatus('error');
    });

    return () => {
      disposed = true;
      window.cancelAnimationFrame(selectionFrame);
      if (trackpad.snapTimer) window.clearTimeout(trackpad.snapTimer);
      documentCleanups.forEach((cleanup) => cleanup());
      documentCleanups.clear();
      const view = ownedView;
      if (view) {
        view.removeEventListener('load', handleLoad);
        view.removeEventListener('relocate', handleRelocate);
        view.removeEventListener('create-overlay', handleCreateOverlay);
        view.removeEventListener('draw-annotation', handleDrawAnnotation);
        view.removeEventListener('show-annotation', handleShowAnnotation);
        view.removeEventListener('pointerdown', handleViewPointerDown);
        view.removeEventListener('wheel', handleWheel);
        try {
          view.close();
        } catch {
          // A reader that failed during initialization may already be partially disposed.
        }
        try {
          view.book?.destroy?.();
        } catch {
          // Blob URLs should still be released even if the source EPUB is malformed.
        }
        view.remove();
      }
      ownedView = null;
      if (viewRef.current === view) viewRef.current = null;
      navigationQueueRef.current = Promise.resolve();
      appliedAnnotationsRef.current.clear();
      hostRef.current?.replaceChildren();
    };
  }, [book.id, syncVisibleAnnotations, turnPage]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view?.renderer || status === 'loading') return;
    applyFoliateReaderLayout(view, compactLayout);
    applyFoliateReaderStyle(view, preferences, compactLayout);
    const selectedFont = resolveReaderStyle(preferences).fontFamily;
    void Promise.all(getFoliateContents(view).map(async ({ doc }) => {
      await ensureReaderFontStylesheet(doc, selectedFont);
      await doc.fonts?.ready;
    })).then(() => {
      if (viewRef.current !== view) return;
      applyFoliateReaderStyle(view, preferencesRef.current, compactLayoutRef.current);
    });
    appliedAnnotationsRef.current.clear();
    const sectionIndex = getFoliateContents(view)[0]?.index;
    if (sectionIndex !== undefined) void syncVisibleAnnotations(view, sectionIndex);
  }, [compactLayout, preferences, status, syncVisibleAnnotations]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view?.renderer || status !== 'ready') return;
    const sectionIndex = getFoliateContents(view)[0]?.index;
    if (sectionIndex !== undefined) void syncVisibleAnnotations(view, sectionIndex);
  }, [highlights, status, syncVisibleAnnotations]);

  const texture = getReaderTextureStyle(readerStyle.texture, readerStyle.isDark);
  const surfaceStyle = {
    '--reader-paper-color': readerStyle.paperColor,
    '--reader-color-scheme': readerStyle.isDark ? 'dark' : 'light',
    '--reader-highlight-color': readerStyle.highlightColor,
    '--reader-highlight-icon-color': readerStyle.textColor,
    '--reader-texture-image': texture.backgroundImage,
    '--reader-texture-size': texture.backgroundSize,
    '--reader-texture-position': texture.backgroundPosition,
    '--reader-texture-blend-mode': texture.backgroundBlendMode,
  } as CSSProperties;

  return (
    <div className="foliate-reader-wrap" style={surfaceStyle} onPointerDown={onContentInteraction}>
      <span ref={commentIconTemplateRef} className="reader-comment-icon-template" aria-hidden="true">
        <IconComment size="large" />
      </span>
      {status === 'loading' && (
        <div className="reader-status"><Spin size="large" /><Text type="tertiary">正在打开 EPUB…</Text></div>
      )}
      {status === 'error' && (
        <div className="reader-status"><Empty title="无法打开这本书" description={errorMessage} /></div>
      )}
      <div ref={hostRef} className="foliate-reader-host" />
    </div>
  );
}
