import { useMemo } from 'react';
import { useLearningStore } from '../../../../../store/useLearningStore';
import { dateKey } from './model';
import { estimateRemainingReadingMs } from './readingEstimate';

export function useReadingTrajectory(bookId: string) {
  const progress = useLearningStore(
    (state) => state.books.find((book) => book.id === bookId)?.progress ?? 0,
  );
  const allSessions = useLearningStore((state) => state.readingSessions);
  const sessions = useMemo(
    () =>
      allSessions
        .filter((session) => session.bookId === bookId && session.durationMs > 0)
        .sort((a, b) => b.startedAt - a.startedAt),
    [allSessions, bookId],
  );
  const dailyHistory = useMemo(() => {
    const groups = new Map<
      string,
      {
        key: string;
        startedAt: number;
        endedAt: number;
        durationMs: number;
        sessionCount: number;
      }
    >();
    sessions.forEach((session) => {
      const key = dateKey(session.startedAt);
      const current = groups.get(key);
      groups.set(
        key,
        current
          ? {
              ...current,
              startedAt: Math.min(current.startedAt, session.startedAt),
              endedAt: Math.max(current.endedAt, session.endedAt),
              durationMs: current.durationMs + session.durationMs,
              sessionCount: current.sessionCount + 1,
            }
          : {
              key,
              startedAt: session.startedAt,
              endedAt: session.endedAt,
              durationMs: session.durationMs,
              sessionCount: 1,
            },
      );
    });
    return Array.from(groups.values()).sort((left, right) => right.startedAt - left.startedAt);
  }, [sessions]);
  const total = sessions.reduce((sum, session) => sum + session.durationMs, 0);
  const remaining = estimateRemainingReadingMs(total, progress);
  const heatmap = useMemo(() => {
    const totals = new Map(dailyHistory.map((day) => [day.key, day.durationMs]));
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Array.from({ length: 84 }, (_, index) => {
      const date = new Date(today);
      date.setDate(today.getDate() - (83 - index));
      const durationMs = totals.get(dateKey(date.getTime())) ?? 0;
      const minutes = durationMs / 60_000;
      const level = minutes === 0 ? 0 : minutes < 15 ? 1 : minutes < 30 ? 2 : minutes < 60 ? 3 : 4;
      return { key: dateKey(date.getTime()), date, durationMs, level };
    });
  }, [dailyHistory]);

  return { sessions, dailyHistory, total, remaining, heatmap };
}
