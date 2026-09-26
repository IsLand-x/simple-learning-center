import type { View } from 'foliate-js/view.js';
import { describe, expect, it, vi } from 'vitest';
import { defaultReaderPreferences } from '../../../../../../store/defaults';
import { bindFoliateDocumentInteractions } from './bindFoliateDocumentInteractions';
import type { FoliateDocumentInteractionsOptions } from './documentInteractionTypes';

vi.mock('./readerAdapter', () => ({
  applyFoliateReaderStyle: vi.fn(),
  rangeToViewportRect: vi.fn(),
  drawFoliateActiveSelection: vi.fn(),
  getFoliateContents: () => [],
  expandFoliateHighlightRects: (rects: unknown[]) => rects,
}));
vi.mock('../../../../../../util/reading/readerFonts', () => ({
  ensureReaderFontStylesheet: () => Promise.resolve(),
}));

function setup() {
  const doc = document.implementation.createHTMLDocument('章节');
  const renderer = {
    setTouchPagingBlocked: vi.fn(),
    cancelTouchPaging: vi.fn(),
    containerPosition: 0,
  };
  const view = { renderer } as unknown as View;
  const callbacks: Array<() => void> = [];
  let disposed = false;
  const options: FoliateDocumentInteractionsOptions = {
    doc,
    view,
    index: 0,
    isDisposed: () => disposed,
    surfaceRef: { current: null },
    highlightsRef: { current: [] },
    compactLayoutRef: { current: true },
    preferencesRef: { current: { ...defaultReaderPreferences } },
    onHighlightClickRef: { current: vi.fn() },
    onContentInteractionRef: { current: vi.fn() },
    onCenterTapRef: { current: vi.fn() },
    touchPagingSelectionLockedRef: { current: false },
    hasCustomMobileSelectionRef: { current: false },
    clearMobileSelectionRef: { current: vi.fn() },
    mobileSelectionControllerRef: { current: null },
    mobileSelectionPointerDragRef: { current: null },
    setMobileSelectionHandles: vi.fn(),
    selectionReporter: { report: vi.fn(), reportRange: vi.fn(), clear: vi.fn(), dispose: vi.fn() },
    handleWheel: vi.fn(),
    turnPage: vi.fn(),
    registerCleanup: (cleanup) => callbacks.push(cleanup),
  };
  const added = vi.spyOn(doc, 'addEventListener');
  const removed = vi.spyOn(doc, 'removeEventListener');
  bindFoliateDocumentInteractions(options);
  const cleanup = () => {
    disposed = true;
    callbacks.forEach((callback) => callback());
  };
  return { options, doc, added, removed, cleanup };
}

describe('Foliate chapter document interaction assembly', () => {
  it('uses the common page-turn command, leaves text input arrows alone, and stops callbacks after cleanup', () => {
    const { options, doc, cleanup } = setup();
    doc.dispatchEvent(
      new KeyboardEvent('keyup', { key: 'ArrowRight', bubbles: true, cancelable: true }),
    );
    expect(options.turnPage).toHaveBeenCalledWith('next');
    const input = doc.createElement('input');
    doc.body.append(input);
    input.dispatchEvent(
      new KeyboardEvent('keyup', { key: 'ArrowLeft', bubbles: true, cancelable: true }),
    );
    expect(options.turnPage).toHaveBeenCalledTimes(1);
    doc.dispatchEvent(new MouseEvent('click'));
    expect(options.onCenterTapRef.current).toHaveBeenCalledOnce();
    cleanup();
    doc.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowRight' }));
    doc.dispatchEvent(new MouseEvent('click'));
    expect(options.turnPage).toHaveBeenCalledTimes(1);
    expect(options.onCenterTapRef.current).toHaveBeenCalledTimes(1);
  });
  it('removes every installed handler using matching capture and releases the old chapter controller', () => {
    const { options, added, removed, cleanup } = setup();
    const handlers = added.mock.calls.filter(([name]) =>
      [
        'selectionchange',
        'selectstart',
        'touchstart',
        'touchmove',
        'touchend',
        'touchcancel',
        'contextmenu',
        'pointerdown',
        'click',
        'keyup',
        'wheel',
      ].includes(name),
    );
    expect(handlers).toHaveLength(11);
    expect(options.mobileSelectionControllerRef.current).not.toBeNull();
    cleanup();
    const capture = (options: boolean | EventListenerOptions | undefined) =>
      typeof options === 'boolean' ? options : (options?.capture ?? false);
    for (const [event, handler, options] of handlers) {
      expect(
        removed.mock.calls.some(
          ([name, listener, removalOptions]) =>
            name === event && handler === listener && capture(options) === capture(removalOptions),
        ),
      ).toBe(true);
    }
    expect(options.mobileSelectionControllerRef.current).toBeNull();
    expect(options.selectionReporter.clear).toHaveBeenCalledWith(false);
  });
});
