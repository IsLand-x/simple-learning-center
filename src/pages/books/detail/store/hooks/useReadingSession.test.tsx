import { act, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useReadingSession } from './useReadingSession';
import type { ReadingSession } from '../../../../../types/domain';

describe('useReadingSession', () => {
  let root: ReturnType<typeof createRoot>;
  let container: HTMLDivElement;
  let pageChanged: ((page?: number, href?: string, cfi?: string) => void) | null;
  let sessions: ReadingSession[];

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T12:00:00Z'));
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    sessions = [];
    pageChanged = null;
    const upsert = (session: ReadingSession) => sessions.push(session);
    function Reader() {
      const pageChangeRef = useRef<((page?: number, href?: string, cfi?: string) => void) | null>(
        null,
      );
      useReadingSession('book-1', upsert, pageChangeRef);
      pageChanged = (...args) => pageChangeRef.current?.(...args);
      return null;
    }
    act(() => root.render(<Reader />));
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('counts at most ten minutes on a page and resumes only after the page changes', () => {
    act(() => vi.advanceTimersByTime(60_000));
    expect(sessions).toHaveLength(0);

    act(() => pageChanged?.(1, 'chapter-1'));
    act(() => vi.advanceTimersByTime(8 * 60_000));
    act(() => {
      document.dispatchEvent(new Event('pointerdown'));
      document.dispatchEvent(new Event('keydown'));
      document.dispatchEvent(new Event('wheel'));
      pageChanged?.(1, 'chapter-1', 'different-cfi');
    });
    act(() => vi.advanceTimersByTime(5 * 60_000));
    expect(sessions.at(-1)?.durationMs).toBe(10 * 60_000);

    act(() => pageChanged?.(2, 'chapter-1'));
    act(() => vi.advanceTimersByTime(60_000));
    expect(sessions.at(-1)?.durationMs).toBe(11 * 60_000);
  });
});
