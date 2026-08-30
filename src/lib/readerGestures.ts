export const MOBILE_TEXT_SELECTION_HOLD_MS = 420;
export const MOBILE_PAGE_TURN_INTENT_WINDOW_MS = 280;
export const MOBILE_PAGE_TURN_INTENT_DISTANCE_PX = 12;
const MOBILE_PAGE_TURN_AXIS_RATIO = 1.2;

export type MobileTouchIntent = 'pending' | 'page-turn' | 'selection';

export interface MobileTouchGesture {
  startedAt: number;
  startX: number;
  startY: number;
  intent: MobileTouchIntent;
}

export function isTextSelectionHold(startedAt: number, currentTime: number) {
  return currentTime - startedAt >= MOBILE_TEXT_SELECTION_HOLD_MS;
}

export function createMobileTouchGesture({
  startedAt,
  startX,
  startY,
  hasSelection,
}: {
  startedAt: number;
  startX: number;
  startY: number;
  hasSelection: boolean;
}): MobileTouchGesture {
  return {
    startedAt,
    startX,
    startY,
    intent: hasSelection ? 'selection' : 'pending',
  };
}

export function markMobileTouchSelection(gesture: MobileTouchGesture | null) {
  if (gesture) gesture.intent = 'selection';
}

export function shouldPreserveMobileTextSelection({
  gesture,
  currentTime,
  hasSelection,
}: {
  gesture: MobileTouchGesture | null;
  currentTime: number;
  hasSelection: boolean;
}) {
  return Boolean(
    gesture
    && (gesture.intent === 'selection'
      || hasSelection
      || (gesture.intent === 'pending' && isTextSelectionHold(gesture.startedAt, currentTime))),
  );
}

export function resolveMobileTouchMove({
  gesture,
  currentX,
  currentY,
  currentTime,
  hasSelection,
}: {
  gesture: MobileTouchGesture;
  currentX: number;
  currentY: number;
  currentTime: number;
  hasSelection: boolean;
}) {
  if (hasSelection) {
    gesture.intent = 'selection';
    return gesture.intent;
  }
  if (gesture.intent !== 'pending') return gesture.intent;
  if (isTextSelectionHold(gesture.startedAt, currentTime)) {
    gesture.intent = 'selection';
    return gesture.intent;
  }

  const elapsed = currentTime - gesture.startedAt;
  const horizontalDistance = Math.abs(currentX - gesture.startX);
  const verticalDistance = Math.abs(currentY - gesture.startY);
  if (
    elapsed <= MOBILE_PAGE_TURN_INTENT_WINDOW_MS
    && horizontalDistance >= MOBILE_PAGE_TURN_INTENT_DISTANCE_PX
    && horizontalDistance >= verticalDistance * MOBILE_PAGE_TURN_AXIS_RATIO
  ) {
    gesture.intent = 'page-turn';
  } else if (elapsed > MOBILE_PAGE_TURN_INTENT_WINDOW_MS) {
    gesture.intent = 'selection';
  }
  return gesture.intent;
}
