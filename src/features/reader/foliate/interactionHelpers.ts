import type { View as FoliateView } from 'foliate-js/view.js';
import { expandFoliateHighlightRects } from '../../../lib/foliateReader';
import { resolveReaderStyle } from '../../../lib/readerThemes';
import type { HighlightItem, ReaderPreferences } from '../../../types';

export function hasActiveTextSelection(selection: Selection | null | undefined) {
  return Boolean(selection && selection.rangeCount > 0 && !selection.isCollapsed);
}

export function findFoliateHighlightAtPoint({
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
    if (
      rects.some((rect) => x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom)
    ) {
      return { highlight, range };
    }
  }
  return undefined;
}

export function isBlockedInteractionTarget(target: EventTarget | null) {
  const element = target as Element | null;
  return Boolean(
    element &&
    typeof element.closest === 'function' &&
    element.closest(
      'a, button, input, textarea, select, [contenteditable="true"], [role="button"], [role="link"], [role="slider"]',
    ),
  );
}

export function isEditingTarget(target: EventTarget | null) {
  const element = target as Element | null;
  return Boolean(
    element &&
    typeof element.closest === 'function' &&
    element.closest(
      'input, textarea, select, [contenteditable="true"], [role="textbox"], [role="combobox"], [role="listbox"], [role="menu"], [role="slider"]',
    ),
  );
}

export function normalizedWheelDelta(event: WheelEvent) {
  const multiplier =
    event.deltaMode === WheelEvent.DOM_DELTA_LINE
      ? 16
      : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
        ? Math.max(1, event.view?.innerWidth ?? window.innerWidth)
        : 1;
  return {
    x: event.deltaX * multiplier,
    y: event.deltaY * multiplier,
  };
}

export function annotationSignature(highlight: HighlightItem, preferences: ReaderPreferences) {
  const style = resolveReaderStyle(preferences);
  return [
    highlight.id,
    highlight.comment ?? '',
    style.highlightColor,
    style.textColor,
    style.isDark,
  ].join(':');
}
