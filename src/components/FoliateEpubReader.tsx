import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type Ref,
} from 'react';
import { IconComment } from '@douyinfe/semi-icons';
import { Empty, Spin, Typography } from '@douyinfe/semi-ui';
import type {
  FoliateNavigationTarget,
  FoliateRelocateDetail,
  FoliateTocItem,
  View as FoliateView,
} from 'foliate-js/view.js';
import type { FoliateOverlayRect, Overlayer as FoliateOverlayer } from 'foliate-js/overlayer.js';
import { loadEpubFile } from '../lib/epubStorage';
import {
  applyFoliateReaderLayout,
  applyFoliateReaderStyle,
  configureFoliateReader,
  createFoliateAnnotation,
  createFoliateView,
  drawFoliateActiveSelection,
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

interface SelectionBoundary {
  node: Node;
  offset: number;
}

type MobileSelectionHandleEndpoint = 'start' | 'end';

interface MobileSelectionHandlePoint {
  left: number;
  top: number;
}

interface MobileSelectionHandlesState {
  start: MobileSelectionHandlePoint | null;
  end: MobileSelectionHandlePoint | null;
  dragging: MobileSelectionHandleEndpoint | null;
}

interface MobileSelectionSession {
  doc: Document;
  index: number;
  range: Range;
  overlayer: FoliateOverlayer;
  activeBoundary: MobileSelectionHandleEndpoint;
}

interface MobileSelectionController {
  clear: () => void;
  refresh: () => void;
  startDrag: (endpoint: MobileSelectionHandleEndpoint) => void;
  moveDrag: (endpoint: MobileSelectionHandleEndpoint, clientX: number, clientY: number) => void;
  endDrag: (endpoint: MobileSelectionHandleEndpoint, clientX: number, clientY: number) => void;
  cancelDrag: () => void;
}

const MOBILE_CUSTOM_HIGHLIGHT_NAME = 'learning-center-mobile-selection';
const MOBILE_CUSTOM_SELECTION_CLASS = 'learning-center-custom-mobile-selection';
const MOBILE_CUSTOM_SELECTION_SLOP_PX = 10;
const MOBILE_SELECTION_HANDLE_ANCHOR_OFFSET_Y = 22;
const MOBILE_SELECTION_PAGE_EDGE_HOLD_MS = 2_000;
const MOBILE_SELECTION_PAGE_EDGE_MIN_PX = 44;
const MOBILE_SELECTION_PAGE_EDGE_MAX_PX = 72;

type MobileSelectionPageDirection = 'prev' | 'next';

function cloneSelectionBoundary(node: Node, offset: number): SelectionBoundary {
  return { node, offset };
}

function getCaretBoundaryAtPoint(doc: Document, x: number, y: number): SelectionBoundary | null {
  const caretDocument = doc as Document & {
    caretRangeFromPoint?: (clientX: number, clientY: number) => Range | null;
  };
  const range = caretDocument.caretRangeFromPoint?.(x, y);
  if (range) return cloneSelectionBoundary(range.startContainer, range.startOffset);
  const position = caretDocument.caretPositionFromPoint?.(x, y);
  return position ? cloneSelectionBoundary(position.offsetNode, position.offset) : null;
}

function compareSelectionBoundaries(
  doc: Document,
  left: SelectionBoundary,
  right: SelectionBoundary,
) {
  if (left.node === right.node) return left.offset - right.offset;
  try {
    const leftRange = doc.createRange();
    leftRange.setStart(left.node, left.offset);
    leftRange.collapse(true);
    const rightRange = doc.createRange();
    rightRange.setStart(right.node, right.offset);
    rightRange.collapse(true);
    return leftRange.compareBoundaryPoints(Range.START_TO_START, rightRange);
  } catch {
    return 0;
  }
}

function createRangeBetweenBoundaries(
  doc: Document,
  left: SelectionBoundary,
  right: SelectionBoundary,
) {
  const range = doc.createRange();
  const [start, end] = compareSelectionBoundaries(doc, left, right) <= 0
    ? [left, right]
    : [right, left];
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);
  return range;
}

function createWordRangeAtBoundary(doc: Document, boundary: SelectionBoundary) {
  if (boundary.node.nodeType !== Node.TEXT_NODE) return null;
  const text = boundary.node.nodeValue ?? '';
  if (!text) return null;
  const offset = Math.max(0, Math.min(boundary.offset, text.length));
  const probeOffset = Math.min(offset, text.length - 1);
  let start = probeOffset;
  let end = Math.min(text.length, start + 1);

  try {
    const segments = new Intl.Segmenter(undefined, { granularity: 'word' }).segment(text);
    for (const segment of segments) {
      const segmentStart = segment.index;
      const segmentEnd = segmentStart + segment.segment.length;
      if (
        probeOffset < segmentStart
        || probeOffset >= segmentEnd
        || !segment.segment.trim()
        || ('isWordLike' in segment && segment.isWordLike === false)
      ) continue;
      start = segmentStart;
      end = segmentEnd;
      break;
    }
  } catch {
    // Fall through to a grapheme-safe character range below.
  }

  if (start === probeOffset && end === Math.min(text.length, start + 1)) {
    try {
      const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text);
      for (const grapheme of graphemes) {
        const graphemeStart = grapheme.index;
        const graphemeEnd = graphemeStart + grapheme.segment.length;
        if (probeOffset < graphemeStart || probeOffset >= graphemeEnd) continue;
        start = graphemeStart;
        end = graphemeEnd;
        break;
      }
    } catch {
      const codePoint = text.codePointAt(probeOffset);
      if (codePoint !== undefined && codePoint > 0xFFFF) end = Math.min(text.length, start + 2);
    }
  }

  const range = doc.createRange();
  range.setStart(boundary.node, start);
  range.setEnd(boundary.node, end);
  return range;
}

function createWordRangeAtPoint(
  doc: Document,
  boundary: SelectionBoundary,
  clientX: number,
  clientY: number,
) {
  const candidateBoundaries = [boundary];
  if (boundary.node.nodeType === Node.TEXT_NODE && boundary.offset > 0) {
    candidateBoundaries.push(cloneSelectionBoundary(boundary.node, boundary.offset - 1));
  }
  const candidates = candidateBoundaries
    .map((candidate) => createWordRangeAtBoundary(doc, candidate))
    .filter((range): range is Range => Boolean(range))
    .filter((range) => Boolean(range.toString().trim()))
    .filter((range, rangeIndex, ranges) => ranges.findIndex((candidate) => (
      candidate.startContainer === range.startContainer
      && candidate.startOffset === range.startOffset
      && candidate.endContainer === range.endContainer
      && candidate.endOffset === range.endOffset
    )) === rangeIndex);
  return candidates.reduce<{ range: Range; score: number } | null>((best, range) => {
    const score = Array.from(range.getClientRects())
      .filter((rect) => rect.width > 0 && rect.height > 0)
      .reduce((closest, rect) => {
        const outsideX = clientX < rect.left
          ? rect.left - clientX
          : clientX > rect.right ? clientX - rect.right : 0;
        const outsideY = clientY < rect.top
          ? rect.top - clientY
          : clientY > rect.bottom ? clientY - rect.bottom : 0;
        const centerX = clientX - (rect.left + rect.width / 2);
        const centerY = clientY - (rect.top + rect.height / 2);
        const candidateScore = (outsideX ** 2 + outsideY ** 2) * 1_000_000
          + centerX ** 2 + centerY ** 2;
        return Math.min(closest, candidateScore);
      }, Number.POSITIVE_INFINITY);
    return !best || score < best.score ? { range, score } : best;
  }, null)?.range ?? null;
}

function constrainRangeToVisibleRange(
  doc: Document,
  range: Range,
  visibleRange: Range | null,
) {
  if (!visibleRange || visibleRange.startContainer.ownerDocument !== doc) return range.cloneRange();
  const rangeStart = cloneSelectionBoundary(range.startContainer, range.startOffset);
  const rangeEnd = cloneSelectionBoundary(range.endContainer, range.endOffset);
  const visibleStart = cloneSelectionBoundary(visibleRange.startContainer, visibleRange.startOffset);
  const visibleEnd = cloneSelectionBoundary(visibleRange.endContainer, visibleRange.endOffset);
  const start = compareSelectionBoundaries(doc, rangeStart, visibleStart) < 0
    ? visibleStart
    : rangeStart;
  const end = compareSelectionBoundaries(doc, rangeEnd, visibleEnd) > 0
    ? visibleEnd
    : rangeEnd;
  if (compareSelectionBoundaries(doc, start, end) >= 0) return null;
  return createRangeBetweenBoundaries(doc, start, end);
}

function getInclusiveVisiblePageBoundary(
  doc: Document,
  visibleRange: Range,
  direction: MobileSelectionPageDirection,
): SelectionBoundary {
  const fallback = direction === 'next'
    ? cloneSelectionBoundary(visibleRange.startContainer, visibleRange.startOffset)
    : cloneSelectionBoundary(visibleRange.endContainer, visibleRange.endOffset);
  const root = doc.body;
  if (!root) return fallback;
  const nodes: Text[] = [];
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const textNode = node as Text;
    const parent = textNode.parentElement;
    const parentStyle = parent ? doc.defaultView?.getComputedStyle(parent) : null;
    if (
      !textNode.nodeValue
      || !visibleRange.intersectsNode(textNode)
      || parent?.closest('script, style, [hidden]')
      || parentStyle?.display === 'none'
      || parentStyle?.visibility === 'hidden'
    ) continue;
    nodes.push(textNode);
  }
  if (direction === 'prev') nodes.reverse();

  const isVisibleGrapheme = (node: Text, start: number, end: number) => {
    const probe = doc.createRange();
    probe.setStart(node, start);
    probe.setEnd(node, end);
    const clipped = constrainRangeToVisibleRange(doc, probe, visibleRange);
    return Boolean(clipped && !clipped.collapsed)
      && Array.from(probe.getClientRects()).some((rect) => rect.width > 0 && rect.height > 0);
  };

  for (const node of nodes) {
    const text = node.nodeValue ?? '';
    const start = node === visibleRange.startContainer ? visibleRange.startOffset : 0;
    const end = node === visibleRange.endContainer ? visibleRange.endOffset : text.length;
    if (end <= start) continue;
    try {
      const segments = Array.from(
        new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text.slice(start, end)),
      ).filter((segment) => segment.segment.trim());
      if (direction === 'prev') segments.reverse();
      for (const segment of segments) {
        const segmentStart = start + segment.index;
        const segmentEnd = segmentStart + segment.segment.length;
        if (!isVisibleGrapheme(node, segmentStart, segmentEnd)) continue;
        return cloneSelectionBoundary(
          node,
          direction === 'next' ? segmentEnd : segmentStart,
        );
      }
    } catch {
      if (direction === 'next') {
        for (let offset = start; offset < end;) {
          const codePoint = text.codePointAt(offset);
          const length = codePoint !== undefined && codePoint > 0xFFFF ? 2 : 1;
          if (
            text.slice(offset, offset + length).trim()
            && isVisibleGrapheme(node, offset, Math.min(end, offset + length))
          ) {
            return cloneSelectionBoundary(node, Math.min(end, offset + length));
          }
          offset += length;
        }
      } else {
        for (let offset = end; offset > start;) {
          const codePoint = text.codePointAt(offset - 1);
          const length = codePoint !== undefined && codePoint >= 0xDC00 && codePoint <= 0xDFFF ? 2 : 1;
          const segmentStart = Math.max(start, offset - length);
          if (
            text.slice(segmentStart, offset).trim()
            && isVisibleGrapheme(node, segmentStart, offset)
          ) {
            return cloneSelectionBoundary(node, segmentStart);
          }
          offset = segmentStart;
        }
      }
    }
  }
  return fallback;
}

function shouldUseCustomMobileSelection(doc: Document) {
  const userAgent = doc.defaultView?.navigator.userAgent ?? '';
  return /Android/i.test(userAgent)
    && /(Chrome|Chromium|EdgA|; wv\))/i.test(userAgent)
    && !/(Firefox|FxiOS)/i.test(userAgent);
}

function getBoundaryProbeRect(
  doc: Document,
  boundary: SelectionBoundary,
  direction: 'after' | 'before',
) {
  const probe = doc.createRange();
  try {
    if (boundary.node.nodeType === Node.TEXT_NODE) {
      const length = boundary.node.nodeValue?.length ?? 0;
      if (!length) return null;
      if (direction === 'after' && boundary.offset < length) {
        probe.setStart(boundary.node, boundary.offset);
        probe.setEnd(boundary.node, Math.min(length, boundary.offset + 1));
      } else if (boundary.offset > 0) {
        probe.setStart(boundary.node, boundary.offset - 1);
        probe.setEnd(boundary.node, boundary.offset);
      } else {
        probe.setStart(boundary.node, 0);
        probe.setEnd(boundary.node, Math.min(length, 1));
      }
    } else {
      const childIndex = direction === 'after' ? boundary.offset : boundary.offset - 1;
      const child = boundary.node.childNodes[Math.max(0, childIndex)];
      if (!child) return null;
      probe.selectNode(child);
    }
  } catch {
    return null;
  }
  return Array.from(probe.getClientRects())
    .find((rect) => rect.width > 0 && rect.height > 0) ?? null;
}

function rectsIntersect(left: DOMRect | DOMRectReadOnly, right: DOMRect | DOMRectReadOnly) {
  return left.right > right.left + 1
    && left.left < right.right - 1
    && left.bottom > right.top + 1
    && left.top < right.bottom - 1;
}

function getMobileSelectionPageEdgeDirection(
  clientY: number,
  top: number,
  bottom: number,
): MobileSelectionPageDirection | null {
  const height = Math.max(0, bottom - top);
  if (!height) return null;
  const edgeSize = Math.min(
    MOBILE_SELECTION_PAGE_EDGE_MAX_PX,
    Math.max(MOBILE_SELECTION_PAGE_EDGE_MIN_PX, height * 0.08),
  );
  if (clientY <= top + edgeSize) return 'prev';
  if (clientY >= bottom - edgeSize) return 'next';
  return null;
}

function getMobileSelectionBoundaryViewportRect(
  range: Range,
  endpoint: MobileSelectionHandleEndpoint,
) {
  const doc = range.startContainer.nodeType === Node.DOCUMENT_NODE
    ? range.startContainer as Document
    : range.startContainer.ownerDocument;
  if (!doc) return null;
  const frameRect = doc.defaultView?.frameElement?.getBoundingClientRect();
  const boundary = endpoint === 'start'
    ? cloneSelectionBoundary(range.startContainer, range.startOffset)
    : cloneSelectionBoundary(range.endContainer, range.endOffset);
  const rect = getBoundaryProbeRect(doc, boundary, endpoint === 'start' ? 'after' : 'before');
  if (!frameRect || !rect) return null;
  return new DOMRect(
    frameRect.left + rect.left,
    frameRect.top + rect.top,
    rect.width,
    rect.height,
  );
}

function getMobileSelectionHandlePositions(
  range: Range,
  surface: HTMLElement,
): MobileSelectionHandlesState | null {
  const doc = range.startContainer.nodeType === Node.DOCUMENT_NODE
    ? range.startContainer as Document
    : range.startContainer.ownerDocument;
  if (!doc) return null;
  const frameRect = doc.defaultView?.frameElement?.getBoundingClientRect();
  if (!frameRect) return null;
  const surfaceRect = surface.getBoundingClientRect();
  const startRect = getBoundaryProbeRect(
    doc,
    cloneSelectionBoundary(range.startContainer, range.startOffset),
    'after',
  );
  const endRect = getBoundaryProbeRect(
    doc,
    cloneSelectionBoundary(range.endContainer, range.endOffset),
    'before',
  );
  const toOuterRect = (rect: DOMRect | DOMRectReadOnly) => new DOMRect(
    frameRect.left + rect.left,
    frameRect.top + rect.top,
    rect.width,
    rect.height,
  );
  const outerStartRect = startRect ? toOuterRect(startRect) : null;
  const outerEndRect = endRect ? toOuterRect(endRect) : null;
  const start = outerStartRect && rectsIntersect(outerStartRect, surfaceRect)
    ? {
      left: outerStartRect.left - surfaceRect.left,
      top: outerStartRect.bottom - surfaceRect.top,
    }
    : null;
  const end = outerEndRect && rectsIntersect(outerEndRect, surfaceRect)
    ? {
      left: outerEndRect.right - surfaceRect.left,
      top: outerEndRect.bottom - surfaceRect.top,
    }
    : null;
  if (!start && !end) return null;
  return {
    start,
    end,
    dragging: null,
  } satisfies MobileSelectionHandlesState;
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
  const surfaceRef = useRef<HTMLDivElement>(null);
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
  const touchPagingSelectionLockedRef = useRef(false);
  const hasCustomMobileSelectionRef = useRef(false);
  const clearMobileSelectionRef = useRef<() => void>(() => undefined);
  const mobileSelectionControllerRef = useRef<MobileSelectionController | null>(null);
  const mobileSelectionPointerDragRef = useRef<{
    pointerId: number;
    endpoint: MobileSelectionHandleEndpoint;
    grabOffsetX: number;
    grabOffsetY: number;
  } | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('请返回书架后重新导入这个 EPUB');
  const [mobileSelectionHandles, setMobileSelectionHandles] = useState<MobileSelectionHandlesState | null>(null);

  useEffect(() => { highlightsRef.current = highlights; }, [highlights]);
  useEffect(() => { compactLayoutRef.current = compactLayout; }, [compactLayout]);
  useEffect(() => { preferencesRef.current = preferences; }, [preferences]);
  useEffect(() => { onLocationRef.current = onLocationChange; }, [onLocationChange]);
  useEffect(() => { onSelectionRef.current = onSelection; }, [onSelection]);
  useEffect(() => { onHighlightClickRef.current = onHighlightClick; }, [onHighlightClick]);
  useEffect(() => { onContentInteractionRef.current = onContentInteraction; }, [onContentInteraction]);
  useEffect(() => { onCenterTapRef.current = onCenterTap; }, [onCenterTap]);

  useEffect(() => {
    const refreshMobileSelectionHandles = () => mobileSelectionControllerRef.current?.refresh();
    window.addEventListener('resize', refreshMobileSelectionHandles);
    return () => window.removeEventListener('resize', refreshMobileSelectionHandles);
  }, []);

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
    clearMobileSelectionRef.current();
    touchPagingSelectionLockedRef.current = false;
    viewRef.current?.renderer.setTouchPagingBlocked?.(false);
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
      clearMobileSelectionRef.current();
      touchPagingSelectionLockedRef.current = false;
      viewRef.current?.renderer.setTouchPagingBlocked?.(false);
      viewRef.current?.deselect();
      onSelectionRef.current(null);
      enqueueNavigation(async (view) => {
        const foliateTarget = resolveFoliateTarget(view, target, label);
        if (!foliateTarget || !await navigateToFoliateTarget(view, foliateTarget)) {
          throw new Error('无法定位到所选内容');
        }
      }, '无法定位到所选内容');
    },
    clearSelection: () => {
      clearMobileSelectionRef.current();
      touchPagingSelectionLockedRef.current = false;
      viewRef.current?.renderer.setTouchPagingBlocked?.(false);
      viewRef.current?.deselect();
    },
    getCurrentText: () => getFoliateContents(viewRef.current)
      .map((content) => content.doc.body?.innerText ?? '')
      .filter(Boolean)
      .join('\n\n'),
  }), [enqueueNavigation, turnPage]);

  useEffect(() => {
    let disposed = false;
    let ownedView: FoliateView | null = null;
    let selectionFrame = 0;
    let selectionReportGeneration = 0;
    const documentCleanups = new Map<Document, () => void>();
    const trackpad: TrackpadState = {
      lastEventAt: 0,
      velocityX: 0,
      velocityY: 0,
      snapping: false,
      snapTimer: null,
    };

    const reportSelectionRange = (
      view: FoliateView,
      doc: Document,
      index: number,
      sourceRange: Range | null,
      sourceRect?: DOMRect | null,
    ) => {
      window.cancelAnimationFrame(selectionFrame);
      const generation = ++selectionReportGeneration;
      const range = sourceRange?.cloneRange() ?? null;
      const rect = sourceRect
        ? new DOMRect(sourceRect.left, sourceRect.top, sourceRect.width, sourceRect.height)
        : null;
      selectionFrame = window.requestAnimationFrame(() => {
        selectionFrame = 0;
        if (disposed || generation !== selectionReportGeneration) return;
        const selectedText = range?.toString().trim() ?? '';
        if (!range || range.collapsed || !selectedText) {
          onSelectionRef.current(null);
          return;
        }
        try {
          onSelectionRef.current({
            text: selectedText.slice(0, 600),
            cfi: view.getCFI(index, range),
            rect: rect ?? rangeToViewportRect(range),
          });
        } catch {
          onSelectionRef.current(null);
        }
      });
    };
    const clearReportedSelection = (notify = true) => {
      selectionReportGeneration += 1;
      window.cancelAnimationFrame(selectionFrame);
      selectionFrame = 0;
      if (notify) onSelectionRef.current(null);
    };
    const reportSelection = (view: FoliateView, doc: Document, index: number) => {
      const selection = doc.defaultView?.getSelection();
      reportSelectionRange(
        view,
        doc,
        index,
        hasActiveTextSelection(selection) ? selection!.getRangeAt(0) : null,
      );
    };

    const handleWheel = (event: WheelEvent) => {
      if (event.ctrlKey || isBlockedInteractionTarget(event.target)) return;
      if (hasCustomMobileSelectionRef.current || touchPagingSelectionLockedRef.current) return;
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
      let replacedDocument = false;
      for (const [loadedDocument, cleanup] of documentCleanups) {
        if (loadedDocument === doc) continue;
        cleanup();
        documentCleanups.delete(loadedDocument);
        replacedDocument = true;
      }
      if (replacedDocument) {
        clearReportedSelection();
        touchPagingSelectionLockedRef.current = false;
        view.renderer.setTouchPagingBlocked?.(false);
      }
      // Foliate dispatches `load` before it creates and attaches the document
      // overlayer. Only decide whether this document needs custom selection
      // here; resolve the overlayer lazily when the long press actually fires.
      const customMobileSelectionEnabled = shouldUseCustomMobileSelection(doc);
      if (customMobileSelectionEnabled) {
        doc.documentElement.classList.add(MOBILE_CUSTOM_SELECTION_CLASS);
      }

      let touchSelectionGesture: MobileTouchGesture | null = null;
      let touchSelectionTimer: number | null = null;
      let customSelectionHoldCanceled = false;
      let touchPagingUnlockTimer: number | null = null;
      let touchStartContainerPosition: number | null = null;
      let pendingPress: {
        boundary: SelectionBoundary;
        clientX: number;
        clientY: number;
        touchIdentifier: number;
      } | null = null;
      let mobileSelectionSession: MobileSelectionSession | null = null;
      let mobileSelectionProgrammatic = false;
      let mobileSelectionProgrammaticTimer: number | null = null;
      let mobileSelectionScrubFrame = 0;
      let mobileSelectionDragFrame = 0;
      let mobileSelectionDragEndpoint: MobileSelectionHandleEndpoint | null = null;
      let mobileSelectionDragFixedBoundary: SelectionBoundary | null = null;
      let mobileSelectionTouchPivot: Range | null = null;
      let mobileSelectionDragPoint: {
        endpoint: MobileSelectionHandleEndpoint;
        clientX: number;
        clientY: number;
      } | null = null;
      let mobileSelectionPageTurnTimer: number | null = null;
      let mobileSelectionPageTurnDirection: MobileSelectionPageDirection | null = null;
      let mobileSelectionPageTurnInFlight = false;
      let mobileSelectionPageTurnNeedsRearm = false;
      let mobileSelectionEdgeContinuationDirection: MobileSelectionPageDirection | null = null;
      let mobileSelectionLatestEdgeDrag: {
        endpoint: MobileSelectionHandleEndpoint;
        direction: MobileSelectionPageDirection;
      } | null = null;
      let suppressCenterTapUntil = 0;
      const hasDocumentSelection = () => Boolean(mobileSelectionSession)
        || hasActiveTextSelection(doc.defaultView?.getSelection());
      const clearTouchSelectionTimer = () => {
        if (touchSelectionTimer !== null) window.clearTimeout(touchSelectionTimer);
        touchSelectionTimer = null;
      };
      const clearTouchPagingUnlockTimer = () => {
        if (touchPagingUnlockTimer !== null) window.clearTimeout(touchPagingUnlockTimer);
        touchPagingUnlockTimer = null;
      };
      const clearMobileSelectionProgrammaticTimer = () => {
        if (mobileSelectionProgrammaticTimer !== null) {
          window.clearTimeout(mobileSelectionProgrammaticTimer);
        }
        mobileSelectionProgrammaticTimer = null;
      };
      const clearMobileSelectionScrubFrame = () => {
        window.cancelAnimationFrame(mobileSelectionScrubFrame);
        mobileSelectionScrubFrame = 0;
      };
      const guardMobileSelectionChange = () => {
        clearMobileSelectionProgrammaticTimer();
        mobileSelectionProgrammatic = true;
        mobileSelectionProgrammaticTimer = window.setTimeout(() => {
          mobileSelectionProgrammatic = false;
          mobileSelectionProgrammaticTimer = null;
        }, 150);
      };
      const removeNativeSelection = () => {
        const selection = doc.defaultView?.getSelection();
        if (!selection?.rangeCount) return;
        guardMobileSelectionChange();
        selection.removeAllRanges();
      };
      const scrubNativeSelection = (remainingFrames = 2) => {
        clearMobileSelectionScrubFrame();
        removeNativeSelection();
        if (!mobileSelectionSession || remainingFrames <= 0) return;
        mobileSelectionScrubFrame = window.requestAnimationFrame(() => {
          mobileSelectionScrubFrame = 0;
          if (mobileSelectionSession) scrubNativeSelection(remainingFrames - 1);
        });
      };
      const restoreTouchStartPosition = () => {
        if (view.renderer.cancelTouchPaging) view.renderer.cancelTouchPaging();
        else view.renderer.cancelTouchScroll?.();
        if (touchStartContainerPosition !== null) {
          view.renderer.containerPosition = touchStartContainerPosition;
        }
      };
      const lockTouchPagingForSelection = () => {
        clearTouchPagingUnlockTimer();
        if (touchPagingSelectionLockedRef.current) return;
        touchPagingSelectionLockedRef.current = true;
        view.renderer.setTouchPagingBlocked?.(true);
        restoreTouchStartPosition();
      };
      const unlockTouchPagingForSelection = () => {
        clearTouchPagingUnlockTimer();
        touchPagingSelectionLockedRef.current = false;
        view.renderer.setTouchPagingBlocked?.(false);
      };
      const scheduleTouchPagingUnlock = () => {
        clearTouchPagingUnlockTimer();
        touchPagingUnlockTimer = window.setTimeout(() => {
          touchPagingUnlockTimer = null;
          if (!touchSelectionGesture && !hasDocumentSelection()) {
            unlockTouchPagingForSelection();
          }
        }, 80);
      };
      const clearMobileSelectionPageTurnTimer = () => {
        if (mobileSelectionPageTurnTimer !== null) {
          window.clearTimeout(mobileSelectionPageTurnTimer);
        }
        mobileSelectionPageTurnTimer = null;
        mobileSelectionPageTurnDirection = null;
      };
      const resetMobileSelectionPageTurnState = () => {
        clearMobileSelectionPageTurnTimer();
        mobileSelectionPageTurnNeedsRearm = false;
        mobileSelectionEdgeContinuationDirection = null;
        mobileSelectionLatestEdgeDrag = null;
      };
      const getVisibleRange = () => {
        const visibleRange = view.lastLocation?.range;
        if (!visibleRange) return null;
        const visibleDocument = visibleRange.startContainer.nodeType === Node.DOCUMENT_NODE
          ? visibleRange.startContainer as Document
          : visibleRange.startContainer.ownerDocument;
        return visibleDocument === doc ? visibleRange : null;
      };
      const clampBoundaryToVisibleRange = (boundary: SelectionBoundary) => {
        const visibleRange = getVisibleRange();
        if (!visibleRange) return boundary;
        const visibleStart = cloneSelectionBoundary(
          visibleRange.startContainer,
          visibleRange.startOffset,
        );
        const visibleEnd = cloneSelectionBoundary(
          visibleRange.endContainer,
          visibleRange.endOffset,
        );
        if (compareSelectionBoundaries(doc, boundary, visibleStart) < 0) return visibleStart;
        if (compareSelectionBoundaries(doc, boundary, visibleEnd) > 0) return visibleEnd;
        return boundary;
      };
      const getBoundaryAtDocumentPoint = (clientX: number, clientY: number) => {
        const boundary = getCaretBoundaryAtPoint(doc, clientX, clientY);
        if (!boundary || boundary.node.ownerDocument !== doc) return null;
        return clampBoundaryToVisibleRange(boundary);
      };
      const getBoundaryAtOuterPoint = (clientX: number, clientY: number) => {
        const frameRect = doc.defaultView?.frameElement?.getBoundingClientRect();
        const surfaceRect = surfaceRef.current?.getBoundingClientRect();
        if (!frameRect || !surfaceRect) return null;
        const left = Math.max(frameRect.left, surfaceRect.left) + 2;
        const right = Math.min(frameRect.right, surfaceRect.right) - 2;
        const top = Math.max(frameRect.top, surfaceRect.top) + 2;
        const bottom = Math.min(frameRect.bottom, surfaceRect.bottom) - 2;
        if (right <= left || bottom <= top) return null;
        const x = Math.max(left, Math.min(right, clientX));
        const y = Math.max(top, Math.min(bottom, clientY));
        return getBoundaryAtDocumentPoint(x - frameRect.left, y - frameRect.top);
      };
      const getDocumentPageEdgeDirection = (clientY: number) => {
        const height = doc.defaultView?.innerHeight ?? doc.documentElement.clientHeight;
        return getMobileSelectionPageEdgeDirection(clientY, 0, height);
      };
      const getOuterPageEdgeDirection = (clientY: number) => {
        const frameRect = doc.defaultView?.frameElement?.getBoundingClientRect();
        const surfaceRect = surfaceRef.current?.getBoundingClientRect();
        if (!frameRect || !surfaceRect) return null;
        return getMobileSelectionPageEdgeDirection(
          clientY,
          Math.max(frameRect.top, surfaceRect.top),
          Math.min(frameRect.bottom, surfaceRect.bottom),
        );
      };
      const paintMobileSelection = () => {
        const session = mobileSelectionSession;
        if (!session) return false;
        try {
          session.overlayer.add(
            MOBILE_CUSTOM_HIGHLIGHT_NAME,
            session.range,
            (rects) => drawFoliateActiveSelection({
              rects,
              preferences: preferencesRef.current,
            }),
          );
          return true;
        } catch {
          return false;
        }
      };
      const alignMobileSelectionHandlesToActiveDrag = (
        positions: MobileSelectionHandlesState,
        session: MobileSelectionSession,
      ) => {
        const dragEndpoint = mobileSelectionDragEndpoint;
        if (!dragEndpoint) {
          positions.dragging = null;
          return positions;
        }
        if (session.activeBoundary !== dragEndpoint) {
          positions[dragEndpoint] = positions[session.activeBoundary];
          positions[session.activeBoundary] = null;
        }
        positions.dragging = dragEndpoint;
        return positions;
      };
      const syncMobileSelectionHandles = () => {
        const session = mobileSelectionSession;
        const surface = surfaceRef.current;
        const positions = session && surface
          ? getMobileSelectionHandlePositions(session.range, surface)
          : null;
        setMobileSelectionHandles(
          positions && session
            ? alignMobileSelectionHandlesToActiveDrag(positions, session)
            : null,
        );
      };
      const refreshMobileSelection = () => {
        if (mobileSelectionPageTurnInFlight) return;
        paintMobileSelection();
        syncMobileSelectionHandles();
      };
      const clearMobileSelectionDragFrame = () => {
        window.cancelAnimationFrame(mobileSelectionDragFrame);
        mobileSelectionDragFrame = 0;
        mobileSelectionDragPoint = null;
      };
      const clearMobileSelection = (notify = true) => {
        clearMobileSelectionDragFrame();
        resetMobileSelectionPageTurnState();
        clearMobileSelectionScrubFrame();
        mobileSelectionDragEndpoint = null;
        mobileSelectionDragFixedBoundary = null;
        mobileSelectionTouchPivot = null;
        pendingPress = null;
        mobileSelectionPointerDragRef.current = null;
        const session = mobileSelectionSession;
        mobileSelectionSession = null;
        hasCustomMobileSelectionRef.current = false;
        if (session) session.overlayer.remove(MOBILE_CUSTOM_HIGHLIGHT_NAME);
        setMobileSelectionHandles(null);
        removeNativeSelection();
        clearReportedSelection(notify);
      };
      const reportMobileSelection = () => {
        const session = mobileSelectionSession;
        if (!session) return;
        reportSelectionRange(
          view,
          doc,
          session.index,
          session.range,
          getMobileSelectionBoundaryViewportRect(session.range, session.activeBoundary),
        );
      };
      const applyMobileSelectionBoundary = (
        endpoint: MobileSelectionHandleEndpoint,
        movingBoundary: SelectionBoundary,
        commit: boolean,
        visualPoint?: { clientX: number; clientY: number },
      ) => {
        const session = mobileSelectionSession;
        const fixedBoundary = mobileSelectionDragFixedBoundary;
        if (!session || !fixedBoundary) return;
        try {
          const nextRange = createRangeBetweenBoundaries(doc, fixedBoundary, movingBoundary);
          if (nextRange.collapsed || !nextRange.toString().trim()) return;
          session.range = nextRange;
          session.activeBoundary = compareSelectionBoundaries(
            doc,
            movingBoundary,
            fixedBoundary,
          ) < 0 ? 'start' : 'end';
          paintMobileSelection();
          reportMobileSelection();
          const surface = surfaceRef.current;
          const positions = surface && getMobileSelectionHandlePositions(nextRange, surface);
          if (positions) {
            const nextHandles = commit
              ? positions
              : alignMobileSelectionHandlesToActiveDrag(positions, session);
            nextHandles.dragging = commit ? null : endpoint;
            if (!commit && visualPoint && surface) {
              const surfaceRect = surface.getBoundingClientRect();
              nextHandles[endpoint] = {
                left: Math.max(0, Math.min(surfaceRect.width, visualPoint.clientX - surfaceRect.left)),
                top: Math.max(0, Math.min(surfaceRect.height, visualPoint.clientY - surfaceRect.top)),
              };
            }
            setMobileSelectionHandles(nextHandles);
          }
        } catch {
          // A section reload can invalidate an endpoint during cleanup.
        }
      };
      const canTurnMobileSelectionPage = (direction: MobileSelectionPageDirection) => {
        const { page, pages } = view.renderer;
        if (
          typeof page !== 'number'
          || typeof pages !== 'number'
          || !Number.isFinite(page)
          || !Number.isFinite(pages)
        ) return false;
        return direction === 'next' ? page < pages - 2 : page > 1;
      };
      const performMobileSelectionPageTurn = async (
        direction: MobileSelectionPageDirection,
        endpoint: MobileSelectionHandleEndpoint,
      ) => {
        const session = mobileSelectionSession;
        const fixedBoundary = mobileSelectionDragFixedBoundary;
        const pageBeforeTurn = view.renderer.page;
        if (
          !session
          || !fixedBoundary
          || mobileSelectionPageTurnInFlight
          || !canTurnMobileSelectionPage(direction)
        ) {
          clearMobileSelectionPageTurnTimer();
          mobileSelectionLatestEdgeDrag = null;
          return;
        }
        const contentBeforeTurn = getFoliateContents(view)
          .find((content) => content.doc === session.doc && content.index === session.index);
        if (!contentBeforeTurn) return;

        clearMobileSelectionPageTurnTimer();
        clearMobileSelectionDragFrame();
        mobileSelectionLatestEdgeDrag = null;
        mobileSelectionPageTurnInFlight = true;
        view.renderer.setTouchPagingBlocked?.(false);
        try {
          await (direction === 'next' ? view.next() : view.prev());
          if (disposed || mobileSelectionSession !== session) return;
          const pageAfterTurn = view.renderer.page;
          if (
            typeof pageBeforeTurn !== 'number'
            || typeof pageAfterTurn !== 'number'
            || pageAfterTurn !== pageBeforeTurn + (direction === 'next' ? 1 : -1)
          ) return;
          const contentAfterTurn = getFoliateContents(view)
            .find((content) => content.doc === session.doc && content.index === session.index);
          const visibleRange = getVisibleRange();
          if (!contentAfterTurn || !visibleRange) return;
          const movingBoundary = getInclusiveVisiblePageBoundary(doc, visibleRange, direction);
          const nextRange = createRangeBetweenBoundaries(doc, fixedBoundary, movingBoundary);
          if (nextRange.collapsed || !nextRange.toString().trim()) return;

          session.range = nextRange;
          session.activeBoundary = compareSelectionBoundaries(
            doc,
            movingBoundary,
            fixedBoundary,
          ) < 0 ? 'start' : 'end';
          paintMobileSelection();
          reportMobileSelection();
          const dragStillActive = mobileSelectionDragEndpoint === endpoint;
          mobileSelectionEdgeContinuationDirection = dragStillActive ? direction : null;
          mobileSelectionPageTurnNeedsRearm = dragStillActive;
          mobileSelectionLatestEdgeDrag = null;
          syncMobileSelectionHandles();
        } catch {
          // Keep the last valid selection if Foliate rejects a page turn.
        } finally {
          mobileSelectionPageTurnInFlight = false;
          if (
            !disposed
            && mobileSelectionSession === session
            && touchPagingSelectionLockedRef.current
          ) view.renderer.setTouchPagingBlocked?.(true);
        }
      };
      const updateMobileSelectionPageTurnHold = (
        endpoint: MobileSelectionHandleEndpoint,
        direction: MobileSelectionPageDirection | null,
      ) => {
        if (!direction) {
          clearMobileSelectionPageTurnTimer();
          mobileSelectionLatestEdgeDrag = null;
          mobileSelectionPageTurnNeedsRearm = false;
          mobileSelectionEdgeContinuationDirection = null;
          return;
        }
        mobileSelectionLatestEdgeDrag = { endpoint, direction };
        if (mobileSelectionPageTurnNeedsRearm || mobileSelectionPageTurnInFlight) {
          clearMobileSelectionPageTurnTimer();
          return;
        }
        if (
          mobileSelectionPageTurnTimer !== null
          && mobileSelectionPageTurnDirection === direction
        ) return;
        clearMobileSelectionPageTurnTimer();
        if (!canTurnMobileSelectionPage(direction)) return;
        mobileSelectionPageTurnDirection = direction;
        mobileSelectionPageTurnTimer = window.setTimeout(() => {
          mobileSelectionPageTurnTimer = null;
          mobileSelectionPageTurnDirection = null;
          const latest = mobileSelectionLatestEdgeDrag;
          if (
            latest?.endpoint === endpoint
            && latest.direction === direction
            && mobileSelectionDragEndpoint === endpoint
          ) void performMobileSelectionPageTurn(direction, endpoint);
        }, MOBILE_SELECTION_PAGE_EDGE_HOLD_MS);
      };
      const updateMobileSelectionFromOuterPoint = (
        endpoint: MobileSelectionHandleEndpoint,
        clientX: number,
        clientY: number,
        commit: boolean,
      ) => {
        if (mobileSelectionPageTurnInFlight) return;
        const edgeDirection = getOuterPageEdgeDirection(clientY);
        const continueFromTurn = Boolean(
          edgeDirection
          && mobileSelectionEdgeContinuationDirection === edgeDirection,
        );
        if (!continueFromTurn) {
          mobileSelectionEdgeContinuationDirection = null;
          const boundary = getBoundaryAtOuterPoint(clientX, clientY);
          if (boundary) applyMobileSelectionBoundary(
            endpoint,
            boundary,
            commit,
            { clientX, clientY },
          );
        }
        if (commit) {
          resetMobileSelectionPageTurnState();
        } else {
          updateMobileSelectionPageTurnHold(endpoint, edgeDirection);
        }
      };
      const startMobileSelectionDrag = (endpoint: MobileSelectionHandleEndpoint) => {
        const session = mobileSelectionSession;
        if (!session) return;
        clearMobileSelectionDragFrame();
        resetMobileSelectionPageTurnState();
        mobileSelectionTouchPivot = null;
        mobileSelectionDragEndpoint = endpoint;
        mobileSelectionDragFixedBoundary = endpoint === 'start'
          ? cloneSelectionBoundary(session.range.endContainer, session.range.endOffset)
          : cloneSelectionBoundary(session.range.startContainer, session.range.startOffset);
        setMobileSelectionHandles((current) => current ? { ...current, dragging: endpoint } : current);
        lockTouchPagingForSelection();
        suppressCenterTapUntil = performance.now() + 450;
      };
      const moveMobileSelectionDrag = (
        endpoint: MobileSelectionHandleEndpoint,
        clientX: number,
        clientY: number,
      ) => {
        if (
          !mobileSelectionSession
          || mobileSelectionPageTurnInFlight
          || mobileSelectionDragEndpoint !== endpoint
          || !mobileSelectionDragFixedBoundary
        ) return;
        mobileSelectionDragPoint = { endpoint, clientX, clientY };
        if (mobileSelectionDragFrame) return;
        mobileSelectionDragFrame = window.requestAnimationFrame(() => {
          mobileSelectionDragFrame = 0;
          const point = mobileSelectionDragPoint;
          mobileSelectionDragPoint = null;
          if (point) updateMobileSelectionFromOuterPoint(
            point.endpoint,
            point.clientX,
            point.clientY,
            false,
          );
        });
      };
      const endMobileSelectionDrag = (
        endpoint: MobileSelectionHandleEndpoint,
        clientX: number,
        clientY: number,
      ) => {
        if (mobileSelectionDragEndpoint !== endpoint) return;
        clearMobileSelectionDragFrame();
        updateMobileSelectionFromOuterPoint(endpoint, clientX, clientY, true);
        resetMobileSelectionPageTurnState();
        mobileSelectionDragEndpoint = null;
        mobileSelectionDragFixedBoundary = null;
        syncMobileSelectionHandles();
      };
      const cancelMobileSelectionDrag = () => {
        clearMobileSelectionDragFrame();
        resetMobileSelectionPageTurnState();
        mobileSelectionDragEndpoint = null;
        mobileSelectionDragFixedBoundary = null;
        syncMobileSelectionHandles();
      };
      const clearThisDocumentMobileSelection = () => {
        clearMobileSelection();
        unlockTouchPagingForSelection();
      };
      const mobileSelectionController: MobileSelectionController = {
        clear: clearThisDocumentMobileSelection,
        refresh: refreshMobileSelection,
        startDrag: startMobileSelectionDrag,
        moveDrag: moveMobileSelectionDrag,
        endDrag: endMobileSelectionDrag,
        cancelDrag: cancelMobileSelectionDrag,
      };
      clearMobileSelectionRef.current = clearThisDocumentMobileSelection;
      mobileSelectionControllerRef.current = mobileSelectionController;

      const beginCustomMobileSelection = () => {
        if (mobileSelectionSession || !pendingPress) return false;
        const customMobileSelectionOverlayer = getFoliateContents(view)
          .find((content) => content.doc === doc)?.overlayer;
        if (!customMobileSelectionOverlayer) return false;
        const wordRange = createWordRangeAtPoint(
          doc,
          pendingPress.boundary,
          pendingPress.clientX,
          pendingPress.clientY,
        );
        if (!wordRange) return false;
        const range = constrainRangeToVisibleRange(doc, wordRange, getVisibleRange());
        if (!range || range.collapsed || !range.toString().trim()) return false;
        mobileSelectionSession = {
          doc,
          index,
          range,
          overlayer: customMobileSelectionOverlayer,
          activeBoundary: 'end',
        };
        hasCustomMobileSelectionRef.current = true;
        mobileSelectionTouchPivot = range.cloneRange();
        mobileSelectionDragEndpoint = null;
        mobileSelectionDragFixedBoundary = null;
        if (!paintMobileSelection()) {
          mobileSelectionSession = null;
          mobileSelectionTouchPivot = null;
          hasCustomMobileSelectionRef.current = false;
          return false;
        }
        syncMobileSelectionHandles();
        lockTouchPagingForSelection();
        markMobileTouchSelection(touchSelectionGesture);
        scrubNativeSelection();
        reportMobileSelection();
        return true;
      };
      const updateCustomMobileSelectionFromTouch = (touch: Touch, commit: boolean) => {
        if (mobileSelectionPageTurnInFlight) return;
        const session = mobileSelectionSession;
        const pivot = mobileSelectionTouchPivot;
        const edgeDirection = getDocumentPageEdgeDirection(touch.clientY);
        const visibleRange = getVisibleRange();
        const movingBoundary = getBoundaryAtDocumentPoint(touch.clientX, touch.clientY)
          ?? (visibleRange && edgeDirection
            ? cloneSelectionBoundary(
              edgeDirection === 'prev' ? visibleRange.startContainer : visibleRange.endContainer,
              edgeDirection === 'prev' ? visibleRange.startOffset : visibleRange.endOffset,
            )
            : null);
        if (!session || !pivot || !movingBoundary) return;
        const pivotStart = cloneSelectionBoundary(pivot.startContainer, pivot.startOffset);
        const pivotEnd = cloneSelectionBoundary(pivot.endContainer, pivot.endOffset);
        const beforePivot = compareSelectionBoundaries(doc, movingBoundary, pivotStart) < 0;
        const afterPivot = compareSelectionBoundaries(doc, movingBoundary, pivotEnd) > 0;
        if (!beforePivot && !afterPivot) {
          resetMobileSelectionPageTurnState();
          session.range = pivot.cloneRange();
          session.activeBoundary = 'end';
          paintMobileSelection();
          reportMobileSelection();
          const surface = surfaceRef.current;
          const positions = surface && getMobileSelectionHandlePositions(session.range, surface);
          if (positions) setMobileSelectionHandles(positions);
          mobileSelectionDragEndpoint = null;
          mobileSelectionDragFixedBoundary = null;
          return;
        }
        const endpoint: MobileSelectionHandleEndpoint = beforePivot ? 'start' : 'end';
        mobileSelectionDragEndpoint = endpoint;
        mobileSelectionDragFixedBoundary = beforePivot ? pivotEnd : pivotStart;
        const continueFromTurn = Boolean(
          edgeDirection
          && mobileSelectionEdgeContinuationDirection === edgeDirection,
        );
        if (!continueFromTurn) {
          mobileSelectionEdgeContinuationDirection = null;
          applyMobileSelectionBoundary(endpoint, movingBoundary, commit);
        }
        if (commit) {
          resetMobileSelectionPageTurnState();
        } else {
          updateMobileSelectionPageTurnHold(endpoint, edgeDirection);
        }
      };
      const finishCustomMobileTouchSelection = () => {
        clearMobileSelectionDragFrame();
        resetMobileSelectionPageTurnState();
        mobileSelectionTouchPivot = null;
        mobileSelectionDragEndpoint = null;
        mobileSelectionDragFixedBoundary = null;
        syncMobileSelectionHandles();
        reportMobileSelection();
      };
      const handleTouchStartCapture = (touchEvent: TouchEvent) => {
        clearTouchSelectionTimer();
        customSelectionHoldCanceled = false;
        const touch = touchEvent.touches.length === 1 ? touchEvent.touches[0] : null;
        if (mobileSelectionSession) {
          clearThisDocumentMobileSelection();
          suppressCenterTapUntil = performance.now() + 450;
        }
        const selectionActive = hasDocumentSelection();
        pendingPress = customMobileSelectionEnabled && touch && !selectionActive
          ? (() => {
            const boundary = getBoundaryAtDocumentPoint(touch.clientX, touch.clientY);
            return boundary ? {
              boundary,
              clientX: touch.clientX,
              clientY: touch.clientY,
              touchIdentifier: touch.identifier,
            } : null;
          })()
          : null;
        if (selectionActive) {
          clearTouchPagingUnlockTimer();
          lockTouchPagingForSelection();
        } else if (touchPagingUnlockTimer !== null) {
          // A collapsed selection used to leave mobile paging locked until the
          // debounce expired. A new gesture is definitive user intent, so make
          // that gesture eligible for paging immediately.
          unlockTouchPagingForSelection();
        }
        const selectionPagingLocked = touchPagingSelectionLockedRef.current;
        touchStartContainerPosition = touch
          ? view.renderer.containerPosition
          : null;
        touchSelectionGesture = touch
          ? createMobileTouchGesture({
            startedAt: performance.now(),
            startX: touch.clientX,
            startY: touch.clientY,
            hasSelection: selectionActive || selectionPagingLocked,
          })
          : null;
        if (touchSelectionGesture?.intent === 'selection') {
          touchEvent.stopImmediatePropagation();
          return;
        }
        if (touchSelectionGesture) {
          const pendingGesture = touchSelectionGesture;
          touchSelectionTimer = window.setTimeout(() => {
            const customHoldReady = customMobileSelectionEnabled && !customSelectionHoldCanceled;
            if (
              touchSelectionGesture === pendingGesture
              && (pendingGesture.intent === 'pending' || customHoldReady)
            ) {
              if (!customMobileSelectionEnabled || (customHoldReady && beginCustomMobileSelection())) {
                markMobileTouchSelection(pendingGesture);
                // Foliate enters its paging state on touchstart. Restore the
                // exact page as soon as the long press becomes our selection.
                lockTouchPagingForSelection();
                suppressCenterTapUntil = performance.now() + 450;
              } else {
                touchSelectionGesture = null;
                pendingPress = null;
                scheduleTouchPagingUnlock();
              }
            }
            touchSelectionTimer = null;
          }, MOBILE_TEXT_SELECTION_HOLD_MS);
        }
      };
      const handleSelectStartCapture = (selectionEvent: Event) => {
        if (customMobileSelectionEnabled) {
          if (selectionEvent.cancelable) selectionEvent.preventDefault();
          if (!mobileSelectionSession) beginCustomMobileSelection();
          scrubNativeSelection();
          markMobileTouchSelection(touchSelectionGesture);
          clearTouchSelectionTimer();
          suppressCenterTapUntil = performance.now() + 450;
          selectionEvent.stopImmediatePropagation();
          return;
        }
        if (compactLayoutRef.current || touchSelectionGesture) {
          lockTouchPagingForSelection();
          selectionEvent.stopImmediatePropagation();
        }
        markMobileTouchSelection(touchSelectionGesture);
        clearTouchSelectionTimer();
      };
      const handleTouchMoveCapture = (touchEvent: TouchEvent) => {
        const gesture = touchSelectionGesture;
        const touch = pendingPress
          ? Array.from(touchEvent.touches)
            .find((candidate) => candidate.identifier === pendingPress?.touchIdentifier)
          : touchEvent.touches[0];
        if (!gesture || !touch) return;
        if (mobileSelectionSession) {
          clearTouchSelectionTimer();
          markMobileTouchSelection(gesture);
          lockTouchPagingForSelection();
          updateCustomMobileSelectionFromTouch(touch, false);
          suppressCenterTapUntil = performance.now() + 450;
          if (touchEvent.cancelable) touchEvent.preventDefault();
          touchEvent.stopImmediatePropagation();
          return;
        }
        const elapsed = performance.now() - gesture.startedAt;
        const distance = Math.hypot(
          touch.clientX - gesture.startX,
          touch.clientY - gesture.startY,
        );
        if (
          customMobileSelectionEnabled
          && gesture.intent === 'pending'
          && elapsed < MOBILE_TEXT_SELECTION_HOLD_MS
          && distance >= MOBILE_CUSTOM_SELECTION_SLOP_PX
        ) {
          customSelectionHoldCanceled = true;
          clearTouchSelectionTimer();
          pendingPress = null;
          touchSelectionGesture = null;
          return;
        }
        const previousIntent = gesture.intent;
        const intent = resolveMobileTouchMove({
          gesture,
          currentX: touch.clientX,
          currentY: touch.clientY,
          currentTime: performance.now(),
          hasSelection: hasDocumentSelection() || touchPagingSelectionLockedRef.current,
        });
        if (intent === 'selection' && previousIntent !== 'selection') {
          lockTouchPagingForSelection();
        }
        if (
          customMobileSelectionEnabled
          && intent === 'selection'
          && elapsed >= MOBILE_TEXT_SELECTION_HOLD_MS
          && beginCustomMobileSelection()
        ) {
          updateCustomMobileSelectionFromTouch(touch, false);
          clearTouchSelectionTimer();
          if (touchEvent.cancelable) touchEvent.preventDefault();
          touchEvent.stopImmediatePropagation();
          return;
        }
        if (
          Math.abs(touch.clientX - gesture.startX) >= 8
          || Math.abs(touch.clientY - gesture.startY) >= 8
        ) suppressCenterTapUntil = performance.now() + 450;
        if (intent !== 'pending') suppressCenterTapUntil = performance.now() + 450;
        if (intent !== 'pending' && !customMobileSelectionEnabled) clearTouchSelectionTimer();
        if (intent !== 'page-turn') {
          if (customMobileSelectionEnabled && touchEvent.cancelable) touchEvent.preventDefault();
          touchEvent.stopImmediatePropagation();
        }
      };
      const handleTouchEndCapture = (touchEvent: TouchEvent) => {
        const gesture = touchSelectionGesture;
        const endedTouch = pendingPress
          ? Array.from(touchEvent.changedTouches)
            .find((candidate) => candidate.identifier === pendingPress?.touchIdentifier)
          : touchEvent.changedTouches[0];
        if (
          customMobileSelectionEnabled
          && !mobileSelectionSession
          && gesture
          && !customSelectionHoldCanceled
          && performance.now() - gesture.startedAt >= MOBILE_TEXT_SELECTION_HOLD_MS
        ) beginCustomMobileSelection();
        if (mobileSelectionSession) {
          if (endedTouch) updateCustomMobileSelectionFromTouch(endedTouch, true);
          finishCustomMobileTouchSelection();
          touchSelectionGesture = null;
          touchStartContainerPosition = null;
          pendingPress = null;
          clearTouchSelectionTimer();
          lockTouchPagingForSelection();
          suppressCenterTapUntil = performance.now() + 450;
          if (touchEvent.cancelable) touchEvent.preventDefault();
          touchEvent.stopImmediatePropagation();
          return;
        }
        const shouldKeepSelection = shouldPreserveMobileTextSelection({
          gesture,
          currentTime: performance.now(),
          hasSelection: hasDocumentSelection() || touchPagingSelectionLockedRef.current,
        });
        if (gesture?.intent !== 'pending' || shouldKeepSelection) {
          suppressCenterTapUntil = performance.now() + 450;
        }
        if (shouldKeepSelection) {
          lockTouchPagingForSelection();
        }
        touchSelectionGesture = null;
        touchStartContainerPosition = null;
        pendingPress = null;
        clearTouchSelectionTimer();
        if (!hasDocumentSelection()) scheduleTouchPagingUnlock();
        if (shouldKeepSelection) touchEvent.stopImmediatePropagation();
      };
      const handleTouchCancelCapture = (touchEvent: TouchEvent) => {
        const gesture = touchSelectionGesture;
        if (mobileSelectionSession) {
          finishCustomMobileTouchSelection();
          touchSelectionGesture = null;
          touchStartContainerPosition = null;
          pendingPress = null;
          clearTouchSelectionTimer();
          lockTouchPagingForSelection();
          suppressCenterTapUntil = performance.now() + 450;
          if (touchEvent.cancelable) touchEvent.preventDefault();
          touchEvent.stopImmediatePropagation();
          return;
        }
        const selectionActive = touchPagingSelectionLockedRef.current || hasDocumentSelection();
        // Mobile WebKit can emit touchcancel before exposing the native text
        // selection. Since the browser cancelled the gesture, pagination must
        // never settle on an adjacent page, even if early movement briefly
        // looked like a horizontal page turn.
        const shouldCancelPaging = Boolean(gesture) || selectionActive;
        if (shouldCancelPaging) {
          suppressCenterTapUntil = performance.now() + 450;
          if (selectionActive || gesture?.intent !== 'page-turn') {
            lockTouchPagingForSelection();
          } else {
            restoreTouchStartPosition();
          }
        }
        touchSelectionGesture = null;
        touchStartContainerPosition = null;
        pendingPress = null;
        clearTouchSelectionTimer();
        if (!hasDocumentSelection()) scheduleTouchPagingUnlock();
        if (shouldCancelPaging) touchEvent.stopImmediatePropagation();
      };
      const handleContextMenu = (contextMenuEvent: Event) => {
        contextMenuEvent.preventDefault();
        if (customMobileSelectionEnabled) {
          beginCustomMobileSelection();
          scrubNativeSelection();
          markMobileTouchSelection(touchSelectionGesture);
          clearTouchSelectionTimer();
          suppressCenterTapUntil = performance.now() + 450;
          contextMenuEvent.stopImmediatePropagation();
          return;
        }
        if (!compactLayoutRef.current) return;
        // Android Chrome may announce a native long press through contextmenu
        // before its Selection is observable. Treat it as selection intent so
        // a synthetic mouse pointer cannot settle or auto-turn the page.
        lockTouchPagingForSelection();
        markMobileTouchSelection(touchSelectionGesture);
        clearTouchSelectionTimer();
        suppressCenterTapUntil = performance.now() + 450;
        contextMenuEvent.stopImmediatePropagation();
      };

      const handleSelectionChange = () => {
        const selection = doc.defaultView?.getSelection();
        if (mobileSelectionSession) {
          if (selection?.rangeCount) removeNativeSelection();
          reportMobileSelection();
          return;
        }
        if (customMobileSelectionEnabled) {
          if (selection?.rangeCount) {
            beginCustomMobileSelection();
            removeNativeSelection();
          }
          if (mobileSelectionSession) reportMobileSelection();
          return;
        }
        if (mobileSelectionProgrammatic) return;
        const selectionActive = hasActiveTextSelection(selection);
        const mobileSelectionActive = compactLayoutRef.current
          || touchPagingSelectionLockedRef.current
          || touchSelectionGesture !== null;
        if (selectionActive) {
          if (mobileSelectionActive) {
            lockTouchPagingForSelection();
          }
          markMobileTouchSelection(touchSelectionGesture);
          clearTouchSelectionTimer();
        } else if (!touchSelectionGesture) {
          scheduleTouchPagingUnlock();
        }
        reportSelection(view, doc, index);
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
      doc.addEventListener('touchmove', handleTouchMoveCapture, { capture: true, passive: false });
      doc.addEventListener('touchend', handleTouchEndCapture, { capture: true, passive: false });
      doc.addEventListener('touchcancel', handleTouchCancelCapture, { capture: true, passive: false });
      doc.addEventListener('contextmenu', handleContextMenu);
      doc.addEventListener('pointerdown', handlePointerDown);
      doc.addEventListener('click', handleClick);
      doc.addEventListener('keyup', handleKeyUp);
      doc.addEventListener('wheel', handleWheel, { passive: false });
      documentCleanups.set(doc, () => {
        clearTouchSelectionTimer();
        clearTouchPagingUnlockTimer();
        clearMobileSelection(false);
        clearMobileSelectionScrubFrame();
        clearMobileSelectionProgrammaticTimer();
        mobileSelectionProgrammatic = false;
        doc.documentElement.classList.remove(MOBILE_CUSTOM_SELECTION_CLASS);
        if (clearMobileSelectionRef.current === clearThisDocumentMobileSelection) {
          clearMobileSelectionRef.current = () => undefined;
        }
        if (mobileSelectionControllerRef.current === mobileSelectionController) {
          mobileSelectionControllerRef.current = null;
        }
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
      window.requestAnimationFrame(() => mobileSelectionControllerRef.current?.refresh());
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
      touchPagingSelectionLockedRef.current = false;
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
      selectionReportGeneration += 1;
      window.cancelAnimationFrame(selectionFrame);
      selectionFrame = 0;
      hasCustomMobileSelectionRef.current = false;
      mobileSelectionPointerDragRef.current = null;
      if (trackpad.snapTimer) window.clearTimeout(trackpad.snapTimer);
      documentCleanups.forEach((cleanup) => cleanup());
      documentCleanups.clear();
      const view = ownedView;
      if (view) {
        touchPagingSelectionLockedRef.current = false;
        view.renderer?.setTouchPagingBlocked?.(false);
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
    window.requestAnimationFrame(() => mobileSelectionControllerRef.current?.refresh());
    const selectedFont = resolveReaderStyle(preferences).fontFamily;
    void Promise.all(getFoliateContents(view).map(async ({ doc }) => {
      await ensureReaderFontStylesheet(doc, selectedFont);
      await doc.fonts?.ready;
    })).then(() => {
      if (viewRef.current !== view) return;
      applyFoliateReaderStyle(view, preferencesRef.current, compactLayoutRef.current);
      window.requestAnimationFrame(() => mobileSelectionControllerRef.current?.refresh());
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

  const handleMobileSelectionPointerDown = (
    endpoint: MobileSelectionHandleEndpoint,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    mobileSelectionControllerRef.current?.cancelDrag();
    const rect = event.currentTarget.getBoundingClientRect();
    mobileSelectionPointerDragRef.current = {
      pointerId: event.pointerId,
      endpoint,
      grabOffsetX: event.clientX - (rect.left + rect.width / 2),
      grabOffsetY: event.clientY - (rect.top + MOBILE_SELECTION_HANDLE_ANCHOR_OFFSET_Y),
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    mobileSelectionControllerRef.current?.startDrag(endpoint);
  };

  const handleMobileSelectionPointerMove = (
    endpoint: MobileSelectionHandleEndpoint,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    const drag = mobileSelectionPointerDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || drag.endpoint !== endpoint) return;
    event.preventDefault();
    event.stopPropagation();
    mobileSelectionControllerRef.current?.moveDrag(
      endpoint,
      event.clientX - drag.grabOffsetX,
      event.clientY - drag.grabOffsetY,
    );
  };

  const handleMobileSelectionPointerUp = (
    endpoint: MobileSelectionHandleEndpoint,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    const drag = mobileSelectionPointerDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || drag.endpoint !== endpoint) return;
    event.preventDefault();
    event.stopPropagation();
    mobileSelectionControllerRef.current?.endDrag(
      endpoint,
      event.clientX - drag.grabOffsetX,
      event.clientY - drag.grabOffsetY,
    );
    mobileSelectionPointerDragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleMobileSelectionPointerCancel = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    mobileSelectionPointerDragRef.current = null;
    mobileSelectionControllerRef.current?.cancelDrag();
  };

  const handleMobileSelectionLostPointerCapture = (
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    const drag = mobileSelectionPointerDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    mobileSelectionPointerDragRef.current = null;
    mobileSelectionControllerRef.current?.cancelDrag();
  };

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
    <div ref={surfaceRef} className="foliate-reader-wrap" style={surfaceStyle} onPointerDown={onContentInteraction}>
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
      {mobileSelectionHandles && (
        <div className="mobile-selection-handles" aria-label="调整文本选区">
          {mobileSelectionHandles.start
            && (!mobileSelectionHandles.dragging || mobileSelectionHandles.dragging === 'start') && (
            <button
              aria-label="拖动选区开头"
              className="mobile-selection-handle mobile-selection-handle--start"
              style={{
                left: mobileSelectionHandles.start.left,
                top: mobileSelectionHandles.start.top,
              }}
              type="button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onContextMenu={(event) => event.preventDefault()}
              onLostPointerCapture={handleMobileSelectionLostPointerCapture}
              onPointerCancel={handleMobileSelectionPointerCancel}
              onPointerDown={(event) => handleMobileSelectionPointerDown('start', event)}
              onPointerMove={(event) => handleMobileSelectionPointerMove('start', event)}
              onPointerUp={(event) => handleMobileSelectionPointerUp('start', event)}
            />
          )}
          {mobileSelectionHandles.end
            && (!mobileSelectionHandles.dragging || mobileSelectionHandles.dragging === 'end') && (
            <button
              aria-label="拖动选区结尾"
              className="mobile-selection-handle mobile-selection-handle--end"
              style={{
                left: mobileSelectionHandles.end.left,
                top: mobileSelectionHandles.end.top,
              }}
              type="button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
              onContextMenu={(event) => event.preventDefault()}
              onLostPointerCapture={handleMobileSelectionLostPointerCapture}
              onPointerCancel={handleMobileSelectionPointerCancel}
              onPointerDown={(event) => handleMobileSelectionPointerDown('end', event)}
              onPointerMove={(event) => handleMobileSelectionPointerMove('end', event)}
              onPointerUp={(event) => handleMobileSelectionPointerUp('end', event)}
            />
          )}
        </div>
      )}
    </div>
  );
}
