import type { View as FoliateView } from 'foliate-js/view.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFoliateTrackpadNavigation } from './trackpadNavigation';

describe('createFoliateTrackpadNavigation', () => {
  let viewRef: { current: FoliateView | null };
  let turnPageRef: { current: (direction: 'next' | 'prev') => void };
  let hasCustomMobileSelectionRef: { current: boolean };
  let touchPagingSelectionLockedRef: { current: boolean };
  let onContentInteractionRef: { current: () => void };

  beforeEach(() => {
    viewRef = {
      current: {
        renderer: {
          scrollBy: vi.fn(),
          snap: vi.fn(),
        },
      } as unknown as FoliateView,
    };
    turnPageRef = { current: vi.fn() };
    hasCustomMobileSelectionRef = { current: false };
    touchPagingSelectionLockedRef = { current: false };
    onContentInteractionRef = { current: vi.fn() };
  });

  it('turns page on vertical wheel scroll down and up', () => {
    const nav = createFoliateTrackpadNavigation({
      viewRef,
      turnPageRef,
      hasCustomMobileSelectionRef,
      touchPagingSelectionLockedRef,
      onContentInteractionRef,
    });

    const scrollDownEvent = new WheelEvent('wheel', { deltaY: 100, cancelable: true });
    nav.handleWheel(scrollDownEvent);

    expect(onContentInteractionRef.current).toHaveBeenCalled();
    expect(turnPageRef.current).toHaveBeenCalledWith('next');

    const scrollUpEvent = new WheelEvent('wheel', { deltaY: -100, cancelable: true });
    nav.handleWheel(scrollUpEvent);

    expect(turnPageRef.current).toHaveBeenCalledWith('prev');
  });

  it('accumulates small wheel delta until reaching threshold', () => {
    const nav = createFoliateTrackpadNavigation({
      viewRef,
      turnPageRef,
      hasCustomMobileSelectionRef,
      touchPagingSelectionLockedRef,
      onContentInteractionRef,
    });

    // Small scroll down (deltaY: 20)
    nav.handleWheel(new WheelEvent('wheel', { deltaY: 20, cancelable: true }));
    expect(turnPageRef.current).not.toHaveBeenCalled();

    // Another small scroll down (deltaY: 35) -> total 55 >= 50
    nav.handleWheel(new WheelEvent('wheel', { deltaY: 35, cancelable: true }));
    expect(turnPageRef.current).toHaveBeenCalledWith('next');
  });

  it('preserves trackpad horizontal swipe panning', () => {
    const nav = createFoliateTrackpadNavigation({
      viewRef,
      turnPageRef,
      hasCustomMobileSelectionRef,
      touchPagingSelectionLockedRef,
      onContentInteractionRef,
    });

    const swipeEvent = new WheelEvent('wheel', { deltaX: 50, deltaY: 0, cancelable: true });
    nav.handleWheel(swipeEvent);

    expect(viewRef.current?.renderer.scrollBy).toHaveBeenCalled();
    expect(turnPageRef.current).not.toHaveBeenCalled();
  });

  it('ignores wheel events when text is selected or interaction is blocked', () => {
    const nav = createFoliateTrackpadNavigation({
      viewRef,
      turnPageRef,
      hasCustomMobileSelectionRef,
      touchPagingSelectionLockedRef,
      onContentInteractionRef,
    });

    const button = document.createElement('button');
    const blockedEvent = new WheelEvent('wheel', { deltaY: 100, cancelable: true });
    Object.defineProperty(blockedEvent, 'target', { value: button });

    nav.handleWheel(blockedEvent);
    expect(turnPageRef.current).not.toHaveBeenCalled();

    const ctrlEvent = new WheelEvent('wheel', { deltaY: 100, ctrlKey: true, cancelable: true });
    nav.handleWheel(ctrlEvent);
    expect(turnPageRef.current).not.toHaveBeenCalled();
  });
});
