import { isTextSelectionHold } from '../../../../../util/reading/readerGestures';

export function getDemoScrollRatio(cfi: string | undefined, href: string | undefined) {
  if (!cfi || !href) return 0;
  const marker = ':scroll:';
  const markerIndex = cfi.lastIndexOf(marker);
  if (markerIndex < 0 || cfi.slice(5, markerIndex) !== href) return 0;
  const ratio = Number(cfi.slice(markerIndex + marker.length));
  return Number.isFinite(ratio) ? Math.max(0, Math.min(1, ratio)) : 0;
}

export function hasActiveTextSelection(selection: Selection | null | undefined) {
  return Boolean(selection && selection.rangeCount > 0 && !selection.isCollapsed);
}

export type PageTurnDirection = 'next' | 'prev';

export interface SwipeStart {
  pointerId: number;
  pointerType: string;
  x: number;
  y: number;
  startedAt: number;
}

export interface WheelSwipeState {
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

export function isSwipeBlockedTarget(target: EventTarget | null) {
  const element = target as Element | null;
  return Boolean(
    element &&
    typeof element.closest === 'function' &&
    element.closest(
      'a, button, input, textarea, select, [contenteditable="true"], [role="button"], [role="link"], [role="slider"]',
    ),
  );
}

export function getSwipePageTurn(
  start: SwipeStart,
  endX: number,
  endY: number,
): PageTurnDirection | null {
  const horizontalDistance = endX - start.x;
  const verticalDistance = endY - start.y;
  if (
    (start.pointerType === 'touch'
      ? isTextSelectionHold(start.startedAt, performance.now())
      : performance.now() - start.startedAt > 1200) ||
    Math.abs(horizontalDistance) < 56 ||
    Math.abs(horizontalDistance) < Math.abs(verticalDistance) * 1.35
  )
    return null;
  return horizontalDistance < 0 ? 'next' : 'prev';
}

export function createWheelSwipeState(): WheelSwipeState {
  return {
    consumed: false,
    direction: 0,
    horizontalSamples: 0,
    lastEventAt: 0,
  };
}

export function getWheelPageTurn(state: WheelSwipeState, event: WheelEvent): WheelPageTurnResult {
  if (event.ctrlKey) return { direction: null, shouldPreventDefault: false };

  const now = performance.now();
  const eventGap = now - state.lastEventAt;
  if (eventGap > WHEEL_GESTURE_IDLE_MS) {
    state.consumed = false;
    state.direction = 0;
    state.horizontalSamples = 0;
  }
  state.lastEventAt = now;

  const deltaMultiplier =
    event.deltaMode === WheelEvent.DOM_DELTA_LINE
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
