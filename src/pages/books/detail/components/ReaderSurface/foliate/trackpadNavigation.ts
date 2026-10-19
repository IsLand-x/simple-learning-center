import type { View as FoliateView } from 'foliate-js/view.js';
import { TRACKPAD_GESTURE_IDLE_MS } from './constants';
import {
  hasActiveTextSelection,
  isBlockedInteractionTarget,
  normalizedWheelDelta,
} from './interactionHelpers';

type MutableReaderRef<T> = { current: T };

interface FoliateTrackpadNavigationOptions {
  viewRef: MutableReaderRef<FoliateView | null>;
  turnPageRef: MutableReaderRef<(direction: 'next' | 'prev') => void>;
  hasCustomMobileSelectionRef: MutableReaderRef<boolean>;
  touchPagingSelectionLockedRef: MutableReaderRef<boolean>;
  onContentInteractionRef: MutableReaderRef<() => void>;
}

export function createFoliateTrackpadNavigation({
  viewRef,
  turnPageRef,
  hasCustomMobileSelectionRef,
  touchPagingSelectionLockedRef,
  onContentInteractionRef,
}: FoliateTrackpadNavigationOptions) {
  const PAGE_TURN_THRESHOLD = 50;
  let lastEventAt: number | null = null;
  let axis: 'x' | 'y' | null = null;
  let accumulator = 0;
  let turned = false;
  let disposed = false;

  const handleWheel = (event: WheelEvent) => {
    if (disposed || event.ctrlKey || isBlockedInteractionTarget(event.target)) return;
    if (hasCustomMobileSelectionRef.current || touchPagingSelectionLockedRef.current) return;
    const selection = (event.target as Node | null)?.ownerDocument?.defaultView?.getSelection();
    if (hasActiveTextSelection(selection)) return;
    const { x, y } = normalizedWheelDelta(event);
    if ((!x && !y) || !viewRef.current) return;

    if (event.cancelable) event.preventDefault();
    onContentInteractionRef.current();

    const now = performance.now();
    if (lastEventAt === null || now - lastEventAt > TRACKPAD_GESTURE_IDLE_MS) {
      axis = Math.abs(x) > Math.abs(y) * 1.05 ? 'x' : 'y';
      accumulator = 0;
      turned = false;
    }
    // Keep consuming the entire gesture, including its inertial tail. A fixed
    // cooldown after a page turn would let a long trackpad swipe turn again.
    lastEventAt = now;
    if (turned) return;

    const delta = axis === 'x' ? x : y;
    if (accumulator * delta < 0) accumulator = 0;
    accumulator += delta;
    if (Math.abs(accumulator) < PAGE_TURN_THRESHOLD) return;

    turned = true;
    turnPageRef.current(accumulator > 0 ? 'next' : 'prev');
  };

  const dispose = () => {
    disposed = true;
  };

  return { handleWheel, dispose };
}
