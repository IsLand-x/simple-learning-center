import { describe, expect, it } from 'vitest';
import { estimateRemainingReadingMs } from './readingEstimate';

describe('remaining reading time', () => {
  it('projects the remaining percentage using recorded reading time', () => {
    expect(estimateRemainingReadingMs(30 * 60_000, 25)).toBe(90 * 60_000);
    expect(estimateRemainingReadingMs(60_000, 50)).toBe(60_000);
  });
  it('waits for enough reading data and rejects invalid values', () => {
    for (const [duration, progress] of [
      [0, 0],
      [59_999, 50],
      [60_000, 0.9],
      [-1, 50],
      [NaN, 50],
      [60_000, Infinity],
    ]) {
      expect(estimateRemainingReadingMs(duration, progress)).toBeNull();
    }
  });
  it('shows completion without requiring a minimum recorded duration', () => {
    expect(estimateRemainingReadingMs(0, 100)).toBe(0);
  });
});
