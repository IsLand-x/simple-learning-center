import { AsyncLocalStorage } from 'node:async_hooks';

type Phase =
  'state_queue' | 'state_read' | 'state_hydrate' | 'state_prepare' | 'state_encode' | 'state_write';
const requestTimings = new AsyncLocalStorage<Map<Phase, number>>();

export function recordServerTiming(phase: Phase, duration: number) {
  const timings = requestTimings.getStore();
  if (timings) timings.set(phase, (timings.get(phase) ?? 0) + duration);
}

export async function measureServerTiming<T>(
  phase: Phase,
  operation: () => T | Promise<T>,
): Promise<T> {
  const start = performance.now();
  try {
    return await operation();
  } finally {
    recordServerTiming(phase, performance.now() - start);
  }
}

export async function collectServerTiming(operation: () => Promise<void>) {
  const timings = new Map<Phase, number>();
  const start = performance.now();
  await requestTimings.run(timings, operation);
  // Fixed phase names and durations only: no paths, queries, content or secrets.
  return [
    `total;dur=${(performance.now() - start).toFixed(1)}`,
    ...[...timings].map(([phase, duration]) => `${phase};dur=${duration.toFixed(1)}`),
  ].join(', ');
}
