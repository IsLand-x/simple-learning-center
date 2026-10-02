import type { View } from 'foliate-js/view.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFoliateSelectionPaging } from './createFoliateSelectionPaging';
import type { FoliateGestureState } from './documentInteractionTypes';

describe('Foliate selection paging lock', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  function setup() {
    const renderer = {
      containerPosition: 240,
      cancelTouchPaging: vi.fn(),
      setTouchPagingBlocked: vi.fn(),
    };
    const view = { renderer } as unknown as View;
    const input: FoliateGestureState = {
      touchSelectionGesture: null,
      touchStartContainerPosition: 120,
      pendingPress: null,
      suppressCenterTapUntil: 0,
    };
    const locked = { current: false };
    const hasSelection = vi.fn(() => false);
    const paging = createFoliateSelectionPaging(
      { view, touchPagingSelectionLockedRef: locked },
      input,
      hasSelection,
    );
    return { renderer, input, locked, hasSelection, paging };
  }
  it('cancels the paginator gesture and restores its starting position once before selection', () => {
    const { renderer, locked, paging } = setup();
    paging.lockTouchPagingForSelection();
    paging.lockTouchPagingForSelection();
    expect(locked.current).toBe(true);
    expect(renderer.cancelTouchPaging).toHaveBeenCalledOnce();
    expect(renderer.containerPosition).toBe(120);
    expect(renderer.setTouchPagingBlocked).toHaveBeenCalledWith(true);
  });
  it('keeps paging blocked while text remains selected and cancels delayed unlock during cleanup', () => {
    const { locked, hasSelection, paging } = setup();
    paging.lockTouchPagingForSelection();
    hasSelection.mockReturnValue(true);
    paging.scheduleTouchPagingUnlock();
    vi.advanceTimersByTime(80);
    expect(locked.current).toBe(true);
    hasSelection.mockReturnValue(false);
    paging.scheduleTouchPagingUnlock();
    paging.clearTouchPagingUnlockTimer();
    vi.advanceTimersByTime(80);
    expect(locked.current).toBe(true);
    paging.scheduleTouchPagingUnlock();
    vi.advanceTimersByTime(80);
    expect(locked.current).toBe(false);
  });
});
