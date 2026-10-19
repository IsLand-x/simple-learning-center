import type { View as FoliateView } from 'foliate-js/view.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFoliateTrackpadNavigation } from './trackpadNavigation';

describe('createFoliateTrackpadNavigation', () => {
  let now: number;
  let options: Parameters<typeof createFoliateTrackpadNavigation>[0];

  beforeEach(() => {
    now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    options = {
      viewRef: {
        current: {
          renderer: { scrollBy: vi.fn(), snap: vi.fn() },
        } as unknown as FoliateView,
      },
      turnPageRef: { current: vi.fn() },
      hasCustomMobileSelectionRef: { current: false },
      touchPagingSelectionLockedRef: { current: false },
      onContentInteractionRef: { current: vi.fn() },
    };
  });

  afterEach(() => vi.restoreAllMocks());

  const wheel = (deltaX: number, deltaY: number, init: WheelEventInit = {}) =>
    new WheelEvent('wheel', { deltaX, deltaY, cancelable: true, ...init });

  it.each([
    [0, 100, 'next'],
    [0, -100, 'prev'],
    [100, 0, 'next'],
    [-100, 0, 'prev'],
  ] as const)('turns one page for delta (%s, %s)', (x, y, direction) => {
    const nav = createFoliateTrackpadNavigation(options);
    const event = wheel(x, y);
    nav.handleWheel(event);
    expect(event.defaultPrevented).toBe(true);
    expect(options.turnPageRef.current).toHaveBeenCalledExactlyOnceWith(direction);
    expect(options.onContentInteractionRef.current).toHaveBeenCalledOnce();
    expect(options.viewRef.current?.renderer.scrollBy).not.toHaveBeenCalled();
    expect(options.viewRef.current?.renderer.snap).not.toHaveBeenCalled();
  });

  it.each(['x', 'y'] as const)(
    'consumes a long %s gesture and inertia without extra turns',
    (axis) => {
      const nav = createFoliateTrackpadNavigation(options);
      for (const delta of [120, 300, 180, 100, 60, 30, 15, 5, 1]) {
        now += 100;
        const event = wheel(axis === 'x' ? delta : 0, axis === 'y' ? delta : 0);
        nav.handleWheel(event);
        expect(event.defaultPrevented).toBe(true);
      }
      expect(options.turnPageRef.current).toHaveBeenCalledExactlyOnceWith('next');
      now += 261;
      nav.handleWheel(wheel(axis === 'x' ? -100 : 0, axis === 'y' ? -100 : 0));
      expect(options.turnPageRef.current).toHaveBeenCalledTimes(2);
      expect(options.turnPageRef.current).toHaveBeenLastCalledWith('prev');
    },
  );

  it('does not turn again when direction or dominant axis changes during a gesture', () => {
    const nav = createFoliateTrackpadNavigation(options);
    nav.handleWheel(wheel(0, 100));
    now += 20;
    nav.handleWheel(wheel(100, 0));
    now += 20;
    nav.handleWheel(wheel(0, -100));
    expect(options.turnPageRef.current).toHaveBeenCalledExactlyOnceWith('next');
  });

  it('accumulates small deltas and resets on direction reversal before turning', () => {
    const nav = createFoliateTrackpadNavigation(options);
    nav.handleWheel(wheel(0, 30));
    nav.handleWheel(wheel(0, -20));
    expect(options.turnPageRef.current).not.toHaveBeenCalled();
    nav.handleWheel(wheel(0, -35));
    expect(options.turnPageRef.current).toHaveBeenCalledExactlyOnceWith('prev');
  });

  it('does not accumulate unrelated gestures', () => {
    const nav = createFoliateTrackpadNavigation(options);
    nav.handleWheel(wheel(0, 30));
    now += 261;
    nav.handleWheel(wheel(0, 30));
    expect(options.turnPageRef.current).not.toHaveBeenCalled();
  });

  it.each([
    [3, WheelEvent.DOM_DELTA_LINE],
    [1, WheelEvent.DOM_DELTA_PAGE],
  ])('normalizes delta %s in mode %s', (delta, deltaMode) => {
    const nav = createFoliateTrackpadNavigation(options);
    nav.handleWheel(wheel(0, delta, { deltaMode }));
    nav.handleWheel(wheel(0, delta, { deltaMode }));
    expect(options.turnPageRef.current).toHaveBeenCalledExactlyOnceWith('next');
  });

  it('preserves zoom, editing, selections and selection locks', () => {
    const nav = createFoliateTrackpadNavigation(options);
    const zoomEvent = wheel(0, 100, { ctrlKey: true });
    nav.handleWheel(zoomEvent);
    expect(zoomEvent.defaultPrevented).toBe(false);
    const input = document.createElement('input');
    const inputEvent = wheel(0, 100);
    Object.defineProperty(inputEvent, 'target', { value: input });
    nav.handleWheel(inputEvent);
    expect(inputEvent.defaultPrevented).toBe(false);
    options.hasCustomMobileSelectionRef.current = true;
    nav.handleWheel(wheel(0, 100));
    options.hasCustomMobileSelectionRef.current = false;
    options.touchPagingSelectionLockedRef.current = true;
    nav.handleWheel(wheel(0, 100));
    options.touchPagingSelectionLockedRef.current = false;
    const selection = document.getSelection();
    const text = document.createTextNode('选中的正文');
    document.body.append(text);
    const range = document.createRange();
    range.selectNodeContents(text);
    selection?.addRange(range);
    const selectedEvent = wheel(0, 100);
    Object.defineProperty(selectedEvent, 'target', { value: text });
    nav.handleWheel(selectedEvent);
    selection?.removeAllRanges();
    text.remove();
    expect(selectedEvent.defaultPrevented).toBe(false);
    expect(options.turnPageRef.current).not.toHaveBeenCalled();
  });

  it('ignores empty events, unavailable views and disposed readers', () => {
    const nav = createFoliateTrackpadNavigation(options);
    nav.handleWheel(wheel(0, 0));
    const view = options.viewRef.current;
    options.viewRef.current = null;
    nav.handleWheel(wheel(0, 100));
    options.viewRef.current = view;
    nav.dispose();
    nav.handleWheel(wheel(0, 100));
    expect(options.turnPageRef.current).not.toHaveBeenCalled();
  });
});
