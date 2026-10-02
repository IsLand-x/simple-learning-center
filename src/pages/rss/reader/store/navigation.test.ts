import { describe, expect, it } from 'vitest';
import { isTimeRange } from './navigation';
describe('RSS navigation', () => {
  it('accepts only supported time ranges', () => {
    expect(isTimeRange('today')).toBe(true);
    expect(isTimeRange('seven-days')).toBe(true);
    expect(isTimeRange('all')).toBe(true);
    expect(isTimeRange('month')).toBe(false);
  });
});
