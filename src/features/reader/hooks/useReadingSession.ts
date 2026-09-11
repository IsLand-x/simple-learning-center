import { useEffect, type MutableRefObject } from 'react';
import { createUuid } from '../../../lib/uuid';
import type { ReadingSession } from '../../../types';

const READING_IDLE_TIMEOUT_MS = 10 * 60 * 1000;
const READING_SESSION_PERSIST_INTERVAL_MS = 15_000;

type UpsertReadingSession = (session: ReadingSession) => void;

export function useReadingSession(
  bookId: string | undefined,
  upsertReadingSession: UpsertReadingSession,
  recordReadingActivityRef: MutableRefObject<(() => void) | null>,
) {
  useEffect(() => {
    if (!bookId) return;
    const sessionId = createUuid();
    const startedAt = Date.now();
    let accumulatedMs = 0;
    let lastCountedAt = startedAt;
    let windowFocused = document.hasFocus();
    let activeSince = document.visibilityState === 'visible' && windowFocused ? startedAt : null;
    let idleDeadline = startedAt + READING_IDLE_TIMEOUT_MS;

    const accumulateUntil = (now: number) => {
      if (activeSince === null) return;
      const countedUntil = Math.min(now, idleDeadline);
      if (countedUntil <= activeSince) return;
      accumulatedMs += countedUntil - activeSince;
      lastCountedAt = countedUntil;
    };

    const canTimeReading = () => document.visibilityState === 'visible' && windowFocused;

    const persistSession = (continueTiming: boolean) => {
      const now = Date.now();
      accumulateUntil(now);
      activeSince = continueTiming && canTimeReading() && now < idleDeadline ? now : null;
      if (accumulatedMs < 1000) return;
      upsertReadingSession({
        id: sessionId,
        bookId,
        startedAt,
        endedAt: lastCountedAt,
        durationMs: accumulatedMs,
      });
    };

    const recordReadingActivity = () => {
      const now = Date.now();
      accumulateUntil(now);
      idleDeadline = now + READING_IDLE_TIMEOUT_MS;
      activeSince = canTimeReading() ? now : null;
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        recordReadingActivity();
      } else {
        persistSession(false);
      }
    };
    const handleFocus = () => {
      windowFocused = true;
      recordReadingActivity();
    };
    const handleBlur = () => {
      persistSession(false);
      windowFocused = false;
    };
    const handlePageHide = () => persistSession(false);
    const interval = window.setInterval(
      () => persistSession(true),
      READING_SESSION_PERSIST_INTERVAL_MS,
    );
    recordReadingActivityRef.current = recordReadingActivity;
    document.addEventListener('visibilitychange', handleVisibility);
    document.addEventListener('pointerdown', recordReadingActivity, true);
    document.addEventListener('keydown', recordReadingActivity, true);
    document.addEventListener('wheel', recordReadingActivity, { capture: true, passive: true });
    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('pagehide', handlePageHide);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
      document.removeEventListener('pointerdown', recordReadingActivity, true);
      document.removeEventListener('keydown', recordReadingActivity, true);
      document.removeEventListener('wheel', recordReadingActivity, true);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('pagehide', handlePageHide);
      if (recordReadingActivityRef.current === recordReadingActivity) {
        recordReadingActivityRef.current = null;
      }
      persistSession(false);
    };
  }, [bookId, recordReadingActivityRef, upsertReadingSession]);
}
