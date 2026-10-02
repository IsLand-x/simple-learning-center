/** Remaining time from recorded reading time and current percentage; jumps and rereading affect this estimate. */
export function estimateRemainingReadingMs(durationMs: number, progress: number): number | null {
  if (!Number.isFinite(progress) || !Number.isFinite(durationMs) || durationMs < 0) return null;
  if (progress >= 100) return 0;
  if (progress < 1 || durationMs < 60_000) return null;
  return (durationMs * (100 - progress)) / progress;
}
