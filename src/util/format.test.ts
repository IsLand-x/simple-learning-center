import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clamp, formatRelativeTime } from './format';

describe('formatRelativeTime', () => {
  const now = new Date('2026-09-11T12:00:00+08:00');

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    [now.getTime() - 59_999, '刚刚'],
    [now.getTime() - 60_000, '1 分钟前'],
    [now.getTime() - 3_600_000, '1 小时前'],
    [now.getTime() - 86_400_000, '昨天'],
  ])('formats recent timestamp %i as %s', (timestamp, expected) => {
    expect(formatRelativeTime(timestamp)).toBe(expected);
  });
});

describe('clamp', () => {
  it.each([
    [3, 1, 5, 3],
    [-1, 1, 5, 1],
    [9, 1, 5, 5],
  ])('clamps %i to [%i, %i]', (value, minimum, maximum, expected) => {
    expect(clamp(value, minimum, maximum)).toBe(expected);
  });
});
