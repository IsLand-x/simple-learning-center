import type { View as FoliateView } from 'foliate-js/view.js';
import { TRACKPAD_GESTURE_IDLE_MS, TRACKPAD_SNAP_DELAY_MS } from './constants';
import {
  hasActiveTextSelection,
  isBlockedInteractionTarget,
  normalizedWheelDelta,
} from './interactionHelpers';
import type { TrackpadState } from './runtimeTypes';

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
  const trackpad: TrackpadState = {
    lastEventAt: 0,
    velocityX: 0,
    velocityY: 0,
    snapping: false,
    snapTimer: null,
  };

  let wheelAccumulator = 0;
  let lastWheelTime = 0;
  const WHEEL_PAGE_TURN_THRESHOLD = 50;
  const WHEEL_IDLE_TIMEOUT_MS = 250;

  const handleWheel = (event: WheelEvent) => {
    if (event.ctrlKey || isBlockedInteractionTarget(event.target)) return;
    if (hasCustomMobileSelectionRef.current || touchPagingSelectionLockedRef.current) return;
    const selection = (event.target as Node | null)?.ownerDocument?.defaultView?.getSelection();
    if (hasActiveTextSelection(selection)) return;
    const { x, y } = normalizedWheelDelta(event);

    const isHorizontalTrackpadSwipe = Math.abs(x) >= 0.35 && Math.abs(x) > Math.abs(y) * 1.05;

    if (isHorizontalTrackpadSwipe) {
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
      return;
    }

    // Vertical wheel scrolling page turn: scroll down -> next, scroll up -> prev
    if (Math.abs(y) > 0) {
      if (event.cancelable) event.preventDefault();
      onContentInteractionRef.current();

      const now = performance.now();
      if (now - lastWheelTime > WHEEL_IDLE_TIMEOUT_MS) {
        wheelAccumulator = 0;
      }
      lastWheelTime = now;

      // Reset accumulator if scrolling direction reversed
      if ((wheelAccumulator > 0 && y < 0) || (wheelAccumulator < 0 && y > 0)) {
        wheelAccumulator = 0;
      }

      wheelAccumulator += y;

      if (Math.abs(wheelAccumulator) >= WHEEL_PAGE_TURN_THRESHOLD) {
        const direction = wheelAccumulator > 0 ? 'next' : 'prev';
        wheelAccumulator = 0;
        turnPageRef.current(direction);
      }
    }
  };

  const dispose = () => {
    if (trackpad.snapTimer) window.clearTimeout(trackpad.snapTimer);
  };

  return { handleWheel, dispose };
}
