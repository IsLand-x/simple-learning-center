import { collapse, compare, parse } from 'foliate-js/epubcfi.js';
import type { HighlightItem } from '../../../../../contracts/reading';

export type AnnotationSortOrder =
  | 'created-desc'
  | 'created-asc'
  | 'position'
  | 'position-asc'
  | 'position-desc';

type Position = ReturnType<typeof parse> | null;

function annotationPosition(cfi: string): Position {
  if (cfi.startsWith('demo:')) {
    const match = /^demo:chapter-(\d+):selection:(\d+)(?::(\d+))?$/.exec(cfi);
    return match ? [[...match.slice(1).map((value) => ({ index: Number(value ?? 0) }))]] : null;
  }
  if (!/^epubcfi\(\//.test(cfi)) return null;
  try {
    const position = collapse(parse(cfi));
    return position.length &&
      position.every(
        (path) =>
          path.length &&
          path.every(
            (step) =>
              Number.isFinite(step.index) &&
              (step.offset === undefined || Number.isFinite(step.offset)),
          ),
      )
      ? position
      : null;
  } catch {
    return null;
  }
}

export function sortAnnotations(
  items: readonly HighlightItem[],
  order: AnnotationSortOrder,
): HighlightItem[] {
  const isPositionSort = order === 'position' || order === 'position-asc' || order === 'position-desc';
  const entries = items.map((item) => ({
    item,
    position: isPositionSort ? annotationPosition(item.cfi) : null,
  }));
  entries.sort((left, right) => {
    if (isPositionSort) {
      if (!left.position && right.position) return 1;
      if (left.position && !right.position) return -1;
      if (left.position && right.position) {
        const difference = compare(left.position, right.position);
        if (difference) return order === 'position-desc' ? -difference : difference;
      }
    }
    const difference = left.item.createdAt - right.item.createdAt;
    return order === 'created-desc' || order === 'position-desc' ? -difference : difference;
  });
  return entries.map(({ item }) => item);
}
