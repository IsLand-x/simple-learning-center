import { useEffect, type MutableRefObject } from 'react';
import { createUuid } from '../../../lib/uuid';
import type { ReadingSession } from '../../../types';

const READING_IDLE_TIMEOUT_MS = 10 * 60 * 1000;
const READING_SESSION_PERSIST_INTERVAL_MS = 15_000;

type UpsertReadingSession = (session: ReadingSession) => void;

export function useReadingSession(
  bookId: string | undefined,
  upsertReadingSession: UpsertReadingSession,
  recordPageChangeRef: MutableRefObject<
    ((page?: number, href?: string, cfi?: string) => void) | null
  >,
) {
  useEffect(() => {
    if (!bookId) return;
    const sessionId = createUuid();
    let startedAt: number | null = null;
    let accumulatedMs = 0;
    let lastCountedAt = 0;
    let activeSince: number | null = null;
    let idleDeadline = 0;
    let lastPageKey: string | null = null;

    const accumulateUntil = (now: number) => {
      if (activeSince === null) return;
      const countedUntil = Math.min(now, idleDeadline);
      if (countedUntil <= activeSince) return;
      accumulatedMs += countedUntil - activeSince;
      lastCountedAt = countedUntil;
    };

    const canTimeReading = () => document.visibilityState === 'visible' && document.hasFocus();

    const persistSession = (continueTiming: boolean) => {
      const now = Date.now();
      accumulateUntil(now);
      activeSince = continueTiming && canTimeReading() && now < idleDeadline ? now : null;
      if (startedAt === null || accumulatedMs < 1000) return;
      upsertReadingSession({
        id: sessionId,
        bookId,
        startedAt,
        endedAt: lastCountedAt,
        durationMs: accumulatedMs,
      });
    };

    const recordPageChange = (page?: number, href?: string, cfi?: string) => {
      const pageKey = Number.isFinite(page) ? `${href ?? ''}:page:${page}` : cfi;
      if (!pageKey || pageKey === lastPageKey) return;
      const now = Date.now();
      accumulateUntil(now);
      if (startedAt === null) startedAt = now;
      lastPageKey = pageKey;
      idleDeadline = now + READING_IDLE_TIMEOUT_MS;
      activeSince = canTimeReading() ? now : null;
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        const now = Date.now();
        activeSince = startedAt !== null && canTimeReading() && now < idleDeadline ? now : null;
      } else {
        persistSession(false);
      }
    };
    const handleFocus = () => {
      const now = Date.now();
      activeSince = startedAt !== null && canTimeReading() && now < idleDeadline ? now : null;
    };
    const handleBlur = () => {
      persistSession(false);
      // Moving focus into an EPUB iframe can blur the outer window while the document stays focused.
      queueMicrotask(handleFocus);
    };
    const handlePageHide = () => persistSession(false);
    const interval = window.setInterval(
      () => persistSession(true),
      READING_SESSION_PERSIST_INTERVAL_MS,
    );
    recordPageChangeRef.current = recordPageChange;
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('pagehide', handlePageHide);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('pagehide', handlePageHide);
      if (recordPageChangeRef.current === recordPageChange) {
        recordPageChangeRef.current = null;
      }
      persistSession(false);
    };
  }, [bookId, recordPageChangeRef, upsertReadingSession]);
}
