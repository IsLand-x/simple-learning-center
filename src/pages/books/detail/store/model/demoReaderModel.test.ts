import { describe, expect, it, vi } from 'vitest';
import {
  createWheelSwipeState,
  getDemoScrollRatio,
  getSwipePageTurn,
  getWheelPageTurn,
  isSwipeBlockedTarget,
  type SwipeStart,
} from './demoReaderModel';

const swipeStart: SwipeStart = {
  pointerId: 1,
  pointerType: 'touch',
  x: 200,
  y: 100,
  startedAt: 0,
};

describe('demo reader progress and navigation', () => {
  it('restores a saved scroll position only for its matching chapter', () => {
    expect(getDemoScrollRatio('demo:chapter-5:scroll:0.625000', 'chapter-5')).toBe(0.625);
    expect(getDemoScrollRatio('demo:chapter-5:scroll:0.625000', 'chapter-4')).toBe(0);
    expect(getDemoScrollRatio('demo:chapter-5:selection:1234', 'chapter-5')).toBe(0);
    expect(getDemoScrollRatio('demo:chapter-5:scroll:invalid', 'chapter-5')).toBe(0);
    expect(getDemoScrollRatio('demo:chapter-5:scroll:2', 'chapter-5')).toBe(1);
  });

  it('turns a page for a quick horizontal swipe while preserving vertical scrolling', () => {
    vi.spyOn(performance, 'now').mockReturnValue(180);
    expect(getSwipePageTurn(swipeStart, 100, 110)).toBe('next');
    expect(getSwipePageTurn(swipeStart, 300, 110)).toBe('prev');
    expect(getSwipePageTurn(swipeStart, 180, 210)).toBeNull();
  });

  it('preserves long press text selection instead of turning a page', () => {
    vi.spyOn(performance, 'now').mockReturnValue(500);
    expect(getSwipePageTurn(swipeStart, 100, 100)).toBeNull();
  });

  it('consumes a trackpad swipe once and permits the next gesture after idle', () => {
    const now = vi.spyOn(performance, 'now').mockReturnValue(100);
    const state = createWheelSwipeState();
    const forward = new WheelEvent('wheel', { deltaX: 30, deltaY: 1 });
    expect(getWheelPageTurn(state, forward)).toEqual({
      direction: 'next',
      shouldPreventDefault: true,
    });
    now.mockReturnValue(150);
    expect(getWheelPageTurn(state, forward).direction).toBeNull();
    now.mockReturnValue(500);
    expect(getWheelPageTurn(state, forward).direction).toBe('next');
  });

  it('leaves vertical scrolling, browser zoom, and interactive controls to their owners', () => {
    const state = createWheelSwipeState();
    expect(getWheelPageTurn(state, new WheelEvent('wheel', { deltaY: 50 }))).toEqual({
      direction: null,
      shouldPreventDefault: false,
    });
    expect(getWheelPageTurn(state, new WheelEvent('wheel', { deltaX: 50, ctrlKey: true }))).toEqual(
      { direction: null, shouldPreventDefault: false },
    );
    const button = document.createElement('button');
    const label = document.createElement('span');
    button.append(label);
    expect(isSwipeBlockedTarget(label)).toBe(true);
    expect(isSwipeBlockedTarget(document.createElement('p'))).toBe(false);
  });
});
