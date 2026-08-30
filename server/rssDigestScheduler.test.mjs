import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dueDigestSchedule } from './rssDigestScheduler.mjs';

test('RSS 日报定时计划支持 2 小时、4 小时和固定时刻', () => {
  const now = new Date('2026-08-30T12:30:00').getTime();
  assert.equal(dueDigestSchedule({ enabled: false }, now), null);
  assert.match(dueDigestSchedule({ enabled: true, scheduleMode: 'every-2-hours' }, now), /every-2-hours$/);
  assert.equal(dueDigestSchedule({
    enabled: true,
    scheduleMode: 'every-4-hours',
    lastAttemptAt: now - 3 * 60 * 60 * 1_000,
  }, now), null);
  assert.match(dueDigestSchedule({
    enabled: true,
    scheduleMode: 'every-4-hours',
    lastAttemptAt: now - 5 * 60 * 60 * 1_000,
  }, now), /every-4-hours$/);

  const fixedKey = dueDigestSchedule({
    enabled: true,
    scheduleMode: 'fixed-times',
    times: ['08:00', '12:00', '18:00'],
  }, now);
  assert.match(fixedKey, /:12:00$/);
  assert.equal(dueDigestSchedule({
    enabled: true,
    scheduleMode: 'fixed-times',
    times: ['08:00', '12:00', '18:00'],
    lastScheduledKey: fixedKey,
  }, now), null);
});
