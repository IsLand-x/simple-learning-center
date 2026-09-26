import type { RssFeed, RssSource } from '../../../contracts/domain.js';
import type { RefreshOptions } from './refresh.js';
import { RSS_REFRESH_INITIAL_DELAY_MS, RSS_REFRESH_INTERVAL_MS } from '../../config.js';
import { fetchRssArticle } from './article.js';
import { fetchRssSource, normalizeRssSource, sourceMinimumIntervalMs } from './sources.js';
import { readPersistedState } from '../state/repository.js';
import { rssState } from './stateProtection.js';
import { refreshPersistedRssFeed } from './refresh.js';

const MIN_FEED_SPACING_MS = 15_000;

function shuffled<T>(values: T[], random: () => number) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

export function createRssScheduler({
  fetchFeed,
  fetchSource,
  fetchArticle = fetchRssArticle,
  initialDelayMs = RSS_REFRESH_INITIAL_DELAY_MS,
  intervalMs = RSS_REFRESH_INTERVAL_MS,
  logger = console,
  minFeedSpacingMs = MIN_FEED_SPACING_MS,
  now = Date.now,
  random = Math.random,
}: RefreshOptions & {
  initialDelayMs?: number;
  intervalMs?: number;
  minFeedSpacingMs?: number;
  now?: () => number;
  random?: () => number;
} = {}) {
  let active = false;
  let cycleTimer: ReturnType<typeof setTimeout> | undefined;
  const feedTimers = new Set<ReturnType<typeof setTimeout>>();
  const sourceFetcher =
    fetchSource ||
    (fetchFeed
      ? (source: RssSource) => fetchFeed((source as { feedUrl?: string }).feedUrl)
      : fetchRssSource);

  const clearTimers = () => {
    clearTimeout(cycleTimer);
    feedTimers.forEach((timer) => clearTimeout(timer));
    feedTimers.clear();
  };

  const scheduleCycle = (delay: number) => {
    clearTimeout(cycleTimer);
    cycleTimer = setTimeout(() => void runCycle(), delay);
    cycleTimer.unref?.();
  };

  const runCycle = async () => {
    if (!active) return 0;
    let feeds: RssFeed[] = [];
    try {
      const persistedState = await readPersistedState();
      feeds = shuffled(rssState(persistedState)?.rssFeeds ?? [], random).filter((feed) => {
        const source = normalizeRssSource(feed.source, feed.url);
        const minimumInterval = Math.max(intervalMs, sourceMinimumIntervalMs(source));
        return !feed.lastFetchedAt || now() - feed.lastFetchedAt >= minimumInterval;
      });
    } catch (error) {
      logger.warn?.(
        `无法读取 RSS 定时任务状态：${error instanceof Error ? error.message : String(error)}`,
      );
    }
    const spacing = feeds.length
      ? Math.max(minFeedSpacingMs, Math.floor(intervalMs / feeds.length))
      : intervalMs;
    feeds.forEach((feed, index) => {
      const timer = setTimeout(() => {
        feedTimers.delete(timer);
        if (active)
          void refreshPersistedRssFeed(feed.id, {
            fetchSource: sourceFetcher,
            fetchArticle,
            logger,
          });
      }, index * spacing);
      timer.unref?.();
      feedTimers.add(timer);
    });
    scheduleCycle(Math.max(intervalMs, spacing * Math.max(feeds.length, 1)));
    return feeds.length;
  };

  return {
    start() {
      if (active) return;
      active = true;
      scheduleCycle(initialDelayMs);
    },
    stop() {
      active = false;
      clearTimers();
    },
    runCycle,
    refreshFeed: (feedId: string) =>
      refreshPersistedRssFeed(feedId, { fetchSource: sourceFetcher, fetchArticle, logger }),
  };
}
