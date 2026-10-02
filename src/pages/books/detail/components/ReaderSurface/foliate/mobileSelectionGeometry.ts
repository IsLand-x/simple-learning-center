import { MOBILE_SELECTION_PAGE_EDGE_MAX_PX, MOBILE_SELECTION_PAGE_EDGE_MIN_PX } from './constants';
import type {
  MobileSelectionHandleEndpoint,
  MobileSelectionHandlesState,
  MobileSelectionPageDirection,
  SelectionBoundary,
} from './runtimeTypes';

export function cloneSelectionBoundary(node: Node, offset: number): SelectionBoundary {
  return { node, offset };
}

export function getCaretBoundaryAtPoint(
  doc: Document,
  x: number,
  y: number,
): SelectionBoundary | null {
  const caretDocument = doc as Document & {
    caretRangeFromPoint?: (clientX: number, clientY: number) => Range | null;
  };
  const range = caretDocument.caretRangeFromPoint?.(x, y);
  if (range) return cloneSelectionBoundary(range.startContainer, range.startOffset);
  const position = caretDocument.caretPositionFromPoint?.(x, y);
  return position ? cloneSelectionBoundary(position.offsetNode, position.offset) : null;
}

export function compareSelectionBoundaries(
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

export function createRangeBetweenBoundaries(
  doc: Document,
  left: SelectionBoundary,
  right: SelectionBoundary,
) {
  const range = doc.createRange();
  const [start, end] =
    compareSelectionBoundaries(doc, left, right) <= 0 ? [left, right] : [right, left];
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
        probeOffset < segmentStart ||
        probeOffset >= segmentEnd ||
        !segment.segment.trim() ||
        ('isWordLike' in segment && segment.isWordLike === false)
      )
        continue;
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
      if (codePoint !== undefined && codePoint > 0xffff) end = Math.min(text.length, start + 2);
    }
  }

  const range = doc.createRange();
  range.setStart(boundary.node, start);
  range.setEnd(boundary.node, end);
  return range;
}

export function createWordRangeAtPoint(
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
    .filter(
      (range, rangeIndex, ranges) =>
        ranges.findIndex(
          (candidate) =>
            candidate.startContainer === range.startContainer &&
            candidate.startOffset === range.startOffset &&
            candidate.endContainer === range.endContainer &&
            candidate.endOffset === range.endOffset,
        ) === rangeIndex,
    );
  return (
    candidates.reduce<{ range: Range; score: number } | null>((best, range) => {
      const score = Array.from(range.getClientRects())
        .filter((rect) => rect.width > 0 && rect.height > 0)
        .reduce((closest, rect) => {
          const outsideX =
            clientX < rect.left
              ? rect.left - clientX
              : clientX > rect.right
                ? clientX - rect.right
                : 0;
          const outsideY =
            clientY < rect.top
              ? rect.top - clientY
              : clientY > rect.bottom
                ? clientY - rect.bottom
                : 0;
          const centerX = clientX - (rect.left + rect.width / 2);
          const centerY = clientY - (rect.top + rect.height / 2);
          const candidateScore =
            (outsideX ** 2 + outsideY ** 2) * 1_000_000 + centerX ** 2 + centerY ** 2;
          return Math.min(closest, candidateScore);
        }, Number.POSITIVE_INFINITY);
      return !best || score < best.score ? { range, score } : best;
    }, null)?.range ?? null
  );
}

export function constrainRangeToVisibleRange(
  doc: Document,
  range: Range,
  visibleRange: Range | null,
) {
  if (!visibleRange || visibleRange.startContainer.ownerDocument !== doc) return range.cloneRange();
  const rangeStart = cloneSelectionBoundary(range.startContainer, range.startOffset);
  const rangeEnd = cloneSelectionBoundary(range.endContainer, range.endOffset);
  const visibleStart = cloneSelectionBoundary(
    visibleRange.startContainer,
    visibleRange.startOffset,
  );
  const visibleEnd = cloneSelectionBoundary(visibleRange.endContainer, visibleRange.endOffset);
  const start =
    compareSelectionBoundaries(doc, rangeStart, visibleStart) < 0 ? visibleStart : rangeStart;
  const end = compareSelectionBoundaries(doc, rangeEnd, visibleEnd) > 0 ? visibleEnd : rangeEnd;
  if (compareSelectionBoundaries(doc, start, end) >= 0) return null;
  return createRangeBetweenBoundaries(doc, start, end);
}

export function getInclusiveVisiblePageBoundary(
  doc: Document,
  visibleRange: Range,
  direction: MobileSelectionPageDirection,
): SelectionBoundary {
  const fallback =
    direction === 'next'
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
      !textNode.nodeValue ||
      !visibleRange.intersectsNode(textNode) ||
      parent?.closest('script, style, [hidden]') ||
      parentStyle?.display === 'none' ||
      parentStyle?.visibility === 'hidden'
    )
      continue;
    nodes.push(textNode);
  }
  if (direction === 'prev') nodes.reverse();

  const isVisibleGrapheme = (node: Text, start: number, end: number) => {
    const probe = doc.createRange();
    probe.setStart(node, start);
    probe.setEnd(node, end);
    const clipped = constrainRangeToVisibleRange(doc, probe, visibleRange);
    return (
      Boolean(clipped && !clipped.collapsed) &&
      Array.from(probe.getClientRects()).some((rect) => rect.width > 0 && rect.height > 0)
    );
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
        return cloneSelectionBoundary(node, direction === 'next' ? segmentEnd : segmentStart);
      }
    } catch {
      if (direction === 'next') {
        for (let offset = start; offset < end;) {
          const codePoint = text.codePointAt(offset);
          const length = codePoint !== undefined && codePoint > 0xffff ? 2 : 1;
          if (
            text.slice(offset, offset + length).trim() &&
            isVisibleGrapheme(node, offset, Math.min(end, offset + length))
          ) {
            return cloneSelectionBoundary(node, Math.min(end, offset + length));
          }
          offset += length;
        }
      } else {
        for (let offset = end; offset > start;) {
          const codePoint = text.codePointAt(offset - 1);
          const length =
            codePoint !== undefined && codePoint >= 0xdc00 && codePoint <= 0xdfff ? 2 : 1;
          const segmentStart = Math.max(start, offset - length);
          if (
            text.slice(segmentStart, offset).trim() &&
            isVisibleGrapheme(node, segmentStart, offset)
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

export function shouldUseCustomMobileSelection(doc: Document) {
  const userAgent = doc.defaultView?.navigator.userAgent ?? '';
  return (
    /Android/i.test(userAgent) &&
    /(Chrome|Chromium|EdgA|; wv\))/i.test(userAgent) &&
    !/(Firefox|FxiOS)/i.test(userAgent)
  );
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
  return (
    Array.from(probe.getClientRects()).find((rect) => rect.width > 0 && rect.height > 0) ?? null
  );
}

function rectsIntersect(left: DOMRect | DOMRectReadOnly, right: DOMRect | DOMRectReadOnly) {
  return (
    left.right > right.left + 1 &&
    left.left < right.right - 1 &&
    left.bottom > right.top + 1 &&
    left.top < right.bottom - 1
  );
}

export function getMobileSelectionPageEdgeDirection(
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

export function getMobileSelectionBoundaryViewportRect(
  range: Range,
  endpoint: MobileSelectionHandleEndpoint,
) {
  const doc =
    range.startContainer.nodeType === Node.DOCUMENT_NODE
      ? (range.startContainer as Document)
      : range.startContainer.ownerDocument;
  if (!doc) return null;
  const frameRect = doc.defaultView?.frameElement?.getBoundingClientRect();
  const boundary =
    endpoint === 'start'
      ? cloneSelectionBoundary(range.startContainer, range.startOffset)
      : cloneSelectionBoundary(range.endContainer, range.endOffset);
  const rect = getBoundaryProbeRect(doc, boundary, endpoint === 'start' ? 'after' : 'before');
  if (!frameRect || !rect) return null;
  return new DOMRect(frameRect.left + rect.left, frameRect.top + rect.top, rect.width, rect.height);
}

export function getMobileSelectionHandlePositions(
  range: Range,
  surface: HTMLElement,
): MobileSelectionHandlesState | null {
  const doc =
    range.startContainer.nodeType === Node.DOCUMENT_NODE
      ? (range.startContainer as Document)
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
  const toOuterRect = (rect: DOMRect | DOMRectReadOnly) =>
    new DOMRect(frameRect.left + rect.left, frameRect.top + rect.top, rect.width, rect.height);
  const outerStartRect = startRect ? toOuterRect(startRect) : null;
  const outerEndRect = endRect ? toOuterRect(endRect) : null;
  const start =
    outerStartRect && rectsIntersect(outerStartRect, surfaceRect)
      ? {
          left: outerStartRect.left - surfaceRect.left,
          top: outerStartRect.bottom - surfaceRect.top,
        }
      : null;
  const end =
    outerEndRect && rectsIntersect(outerEndRect, surfaceRect)
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
