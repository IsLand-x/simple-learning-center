import { readPersistedState } from './storage.mjs';

const DEFAULT_CHECK_INTERVAL_MS = 60_000;
const DEFAULT_INITIAL_DELAY_MS = 20_000;

function localDateKey(timestamp) {
  return new Date(timestamp).toLocaleDateString('en-CA');
}

function localTimeKey(timestamp) {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(timestamp);
}

export function dueDigestSchedule(settings, now = Date.now()) {
  if (!settings?.enabled) return null;
  if (settings.scheduleMode === 'fixed-times') {
    const currentTime = localTimeKey(now);
    const dueTime = (Array.isArray(settings.times) ? settings.times : [])
      .filter((time) => /^([01]\d|2[0-3]):[0-5]\d$/.test(time) && time <= currentTime)
      .sort()
      .at(-1);
    if (!dueTime) return null;
    const key = `${localDateKey(now)}:${dueTime}`;
    return settings.lastScheduledKey === key ? null : key;
  }
  const intervalHours = settings.scheduleMode === 'every-2-hours' ? 2 : 4;
  const intervalMs = intervalHours * 60 * 60 * 1_000;
  return !Number.isFinite(settings.lastAttemptAt) || now - settings.lastAttemptAt >= intervalMs
    ? `${localDateKey(now)}:every-${intervalHours}-hours`
    : null;
}

export function createRssDigestScheduler({
  startDigest,
  checkIntervalMs = DEFAULT_CHECK_INTERVAL_MS,
  initialDelayMs = DEFAULT_INITIAL_DELAY_MS,
  logger = console,
  now = Date.now,
} = {}) {
  let active = false;
  let timer;
  let running = false;

  const schedule = (delay) => {
    clearTimeout(timer);
    timer = setTimeout(() => void runCycle(), delay);
    timer.unref?.();
  };

  const runCycle = async () => {
    if (!active || running) return false;
    running = true;
    let started = false;
    try {
      const persistedState = await readPersistedState();
      const settings = persistedState?.state?.rssDigestSettings;
      const timestamp = now();
      const scheduleKey = dueDigestSchedule(settings, timestamp);
      if (scheduleKey && typeof startDigest === 'function') {
        await startDigest({
          date: localDateKey(timestamp),
          force: false,
          trigger: 'schedule',
          scheduleKey,
        });
        started = true;
      }
    } catch (error) {
      logger.warn?.(`RSS 日报定时任务失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      running = false;
      if (active) schedule(checkIntervalMs);
    }
    return started;
  };

  return {
    start() {
      if (active) return;
      active = true;
      schedule(initialDelayMs);
    },
    stop() {
      active = false;
      clearTimeout(timer);
    },
    runCycle,
  };
}
