import { RSS_REFRESH_INITIAL_DELAY_MS, RSS_REFRESH_INTERVAL_MS } from './config.mjs';
import { fetchRssArticle } from './rssArticle.mjs';
import { fetchRssSource, normalizeRssSource, sourceMinimumIntervalMs } from './rssSources.mjs';
import { mutatePersistedState, readPersistedState } from './storage.mjs';

const MIN_FEED_SPACING_MS = 15_000;
const MAX_AUTO_ARTICLE_FETCHES_PER_CYCLE = 6;
const FULL_CONTENT_FIELDS = [
  'fullContentHtml',
  'fullContentText',
  'fullContentUrl',
  'fullContentFetchedAt',
  'fullContentError',
];

function rssState(persistedState) {
  return persistedState?.state && typeof persistedState.state === 'object'
    ? persistedState.state
    : null;
}

function fetchedItemsForFeed(feedId, result) {
  return (Array.isArray(result?.items) ? result.items : []).map((item) => ({
    ...item,
    id: `${feedId}:${item.id}`,
    feedId,
    fetchedAt: result.fetchedAt,
  }));
}

function copyFullContent(target, source) {
  FULL_CONTENT_FIELDS.forEach((field) => copyOptionalField(target, source, field));
  return target;
}

function mergeFetchedItems(existingItems, feedId, incomingItems) {
  const existing = new Map(
    existingItems.filter((item) => item.feedId === feedId).map((item) => [item.id, item]),
  );
  const merged = incomingItems.map((item) => {
    const previous = existing.get(item.id);
    if (!previous) return item;
    const hasNewFullContent = Number(item.fullContentFetchedAt || 0) > Number(previous.fullContentFetchedAt || 0);
    return {
      ...item,
      ...(previous.readAt ? { readAt: previous.readAt } : {}),
      ...(previous.bookmarkedAt ? { bookmarkedAt: previous.bookmarkedAt } : {}),
      ...(!hasNewFullContent && previous.aiSummary ? {
        aiSummary: previous.aiSummary,
        aiSummaryUpdatedAt: previous.aiSummaryUpdatedAt,
        aiSummaryVersion: previous.aiSummaryVersion,
      } : {}),
      ...(!hasNewFullContent && previous.aiTranslation ? {
        aiTranslation: previous.aiTranslation,
        aiTranslationUpdatedAt: previous.aiTranslationUpdatedAt,
        aiTranslationSourceFetchedAt: previous.aiTranslationSourceFetchedAt,
      } : {}),
      ...(Number(previous.fullContentFetchedAt || 0) > Number(item.fullContentFetchedAt || 0) ? {
        fullContentHtml: previous.fullContentHtml,
        fullContentText: previous.fullContentText,
        fullContentUrl: previous.fullContentUrl,
        fullContentFetchedAt: previous.fullContentFetchedAt,
        fullContentError: previous.fullContentError,
      } : {}),
    };
  });
  const mergedIds = new Set(merged.map((item) => item.id));
  const feedItems = [
    ...merged,
    ...Array.from(existing.values()).filter((item) => !mergedIds.has(item.id)),
  ].sort((left, right) => right.publishedAt - left.publishedAt);
  return [
    ...existingItems.filter((item) => item.feedId !== feedId),
    ...feedItems,
  ];
}

function copyOptionalField(target, source, field) {
  if (Object.hasOwn(source, field)) target[field] = source[field];
  else delete target[field];
}

function mergeConcurrentItem(incomingItem, currentItem) {
  const currentIsNewer = Number(currentItem.fetchedAt || 0) > Number(incomingItem.fetchedAt || 0);
  const merged = currentIsNewer
    ? { ...incomingItem, ...currentItem }
    : { ...currentItem, ...incomingItem };
  copyOptionalField(merged, incomingItem, 'readAt');
  copyOptionalField(merged, incomingItem, 'bookmarkedAt');
  const incomingFullContentAt = Number(incomingItem.fullContentFetchedAt || 0);
  const currentFullContentAt = Number(currentItem.fullContentFetchedAt || 0);
  const fullContentSource = currentFullContentAt > incomingFullContentAt ? currentItem : incomingItem;
  copyFullContent(merged, fullContentSource);
  const incomingSummaryAt = Number(incomingItem.aiSummaryUpdatedAt || 0);
  const currentSummaryAt = Number(currentItem.aiSummaryUpdatedAt || 0);
  const summarySource = incomingFullContentAt === currentFullContentAt
    ? currentSummaryAt > incomingSummaryAt ? currentItem : incomingItem
    : fullContentSource;
  copyOptionalField(merged, summarySource, 'aiSummary');
  copyOptionalField(merged, summarySource, 'aiSummaryUpdatedAt');
  copyOptionalField(merged, summarySource, 'aiSummaryVersion');
  const incomingTranslationAt = Number(incomingItem.aiTranslationUpdatedAt || 0);
  const currentTranslationAt = Number(currentItem.aiTranslationUpdatedAt || 0);
  const translationSource = incomingFullContentAt === currentFullContentAt
    ? currentTranslationAt > incomingTranslationAt ? currentItem : incomingItem
    : fullContentSource;
  copyOptionalField(merged, translationSource, 'aiTranslation');
  copyOptionalField(merged, translationSource, 'aiTranslationUpdatedAt');
  copyOptionalField(merged, translationSource, 'aiTranslationSourceFetchedAt');
  return merged;
}

/**
 * A same-version browser may PUT a snapshot taken just before the scheduler
 * persisted new entries. Preserve those server-fetched entries while keeping
 * browser-owned management, read and bookmark changes authoritative.
 */
export function protectServerRssState(incomingPersistedState, currentPersistedState) {
  const incoming = rssState(incomingPersistedState);
  const current = rssState(currentPersistedState);
  const originalIncomingVersion = Number(incomingPersistedState?.version || 0);
  if (!incoming || !current || Number(incomingPersistedState.version || 0) < 16) {
    return incomingPersistedState;
  }

  const incomingFeeds = Array.isArray(incoming.rssFeeds) ? incoming.rssFeeds : [];
  const currentFeeds = new Map(
    (Array.isArray(current.rssFeeds) ? current.rssFeeds : []).map((feed) => [feed.id, feed]),
  );
  incoming.rssFeeds = incomingFeeds.map((feed) => {
    const serverFeed = currentFeeds.get(feed.id);
    if (!serverFeed || Number(serverFeed.lastFetchedAt || 0) <= Number(feed.lastFetchedAt || 0)) {
      return feed;
    }
    return {
      ...feed,
      siteUrl: serverFeed.siteUrl || feed.siteUrl,
      description: serverFeed.description || feed.description,
      lastFetchedAt: serverFeed.lastFetchedAt,
      lastSuccessAt: serverFeed.lastSuccessAt,
      lastError: serverFeed.lastError,
      lastErrorCode: serverFeed.lastErrorCode,
    };
  });

  const activeFeedIds = new Set(incoming.rssFeeds.map((feed) => feed.id));
  const incomingItems = Array.isArray(incoming.rssItems) ? incoming.rssItems : [];
  const incomingById = new Map(incomingItems.map((item) => [item.id, item]));
  const currentItems = (Array.isArray(current.rssItems) ? current.rssItems : [])
    .filter((item) => activeFeedIds.has(item.feedId));
  const mergedItems = incomingItems.map((item) => {
    const serverItem = currentItems.find((candidate) => candidate.id === item.id);
    return serverItem ? mergeConcurrentItem(item, serverItem) : item;
  });
  currentItems.forEach((item) => {
    if (!incomingById.has(item.id)) mergedItems.push(item);
  });
  incoming.rssItems = Array.from(activeFeedIds).flatMap((feedId) => (
    mergedItems
      .filter((item) => item.feedId === feedId)
      .sort((left, right) => right.publishedAt - left.publishedAt)
  ));
  const incomingSupportsDigests = Number(incomingPersistedState.version || 0) >= 19;
  const incomingDigests = incomingSupportsDigests && Array.isArray(incoming.rssDailyDigests) ? incoming.rssDailyDigests : [];
  const incomingDigestIds = new Set(incomingDigests.map((digest) => digest.id));
  const currentDigests = Array.isArray(current.rssDailyDigests) ? current.rssDailyDigests : [];
  incoming.rssDailyDigests = [
    ...incomingDigests.map((digest) => {
      const serverDigest = currentDigests.find((item) => item.id === digest.id);
      return serverDigest && Number(serverDigest.updatedAt || 0) > Number(digest.updatedAt || 0)
        ? serverDigest
        : digest;
    }),
    ...currentDigests.filter((digest) => !incomingDigestIds.has(digest.id)),
  ].sort((left, right) => right.date.localeCompare(left.date));
  const incomingDigestSettings = incomingSupportsDigests ? incoming.rssDigestSettings || {} : current.rssDigestSettings || {};
  const currentDigestSettings = current.rssDigestSettings || {};
  incoming.rssDigestSettings = {
    ...incomingDigestSettings,
    ...(Number(currentDigestSettings.lastAttemptAt || 0) > Number(incomingDigestSettings.lastAttemptAt || 0) ? {
      lastAttemptAt: currentDigestSettings.lastAttemptAt,
      lastScheduledKey: currentDigestSettings.lastScheduledKey,
    } : {}),
    ...(Number(currentDigestSettings.lastCompletedAt || 0) > Number(incomingDigestSettings.lastCompletedAt || 0) ? {
      lastCompletedAt: currentDigestSettings.lastCompletedAt,
      lastError: currentDigestSettings.lastError,
    } : {}),
  };
  if (Number(currentPersistedState.version || 0) >= 20) {
    incoming.rssDigestRuns = structuredClone(
      Array.isArray(current.rssDigestRuns) ? current.rssDigestRuns : [],
    );
  }
  if (
    Number(currentPersistedState.version || 0) >= 21
    && Number(incomingPersistedState.version || 0) < 21
  ) {
    incoming.rssDigestSettings = structuredClone(current.rssDigestSettings || {});
    incomingPersistedState.version = currentPersistedState.version;
  }
  if (
    Number(currentPersistedState.version || 0) >= 22
    && originalIncomingVersion < 22
  ) {
    const currentFeedsById = new Map(
      (Array.isArray(current.rssFeeds) ? current.rssFeeds : []).map((feed) => [feed.id, feed]),
    );
    incoming.rssFeeds = (Array.isArray(incoming.rssFeeds) ? incoming.rssFeeds : []).map((feed) => {
      const currentFeed = currentFeedsById.get(feed.id);
      return currentFeed?.source ? { ...feed, source: structuredClone(currentFeed.source) } : feed;
    });
    incomingPersistedState.version = currentPersistedState.version;
  }
  return incomingPersistedState;
}

async function performPersistedRssRefresh(feedId, {
  fetchFeed,
  fetchSource,
  fetchArticle = fetchRssArticle,
  logger = console,
} = {}) {
  const persistedState = await readPersistedState();
  const feed = rssState(persistedState)?.rssFeeds?.find((item) => item.id === feedId);
  if (!feed) return { status: 'missing', feedId };

  try {
    const source = normalizeRssSource(feed.source, feed.url);
    const result = fetchSource
      ? await fetchSource(source)
      : fetchFeed
        ? await fetchFeed(feed.url)
        : await fetchRssSource(source);
    const existingItems = new Map(
      (rssState(persistedState)?.rssItems ?? [])
        .filter((item) => item.feedId === feedId)
        .map((item) => [item.id, item]),
    );
    const fetchedItems = fetchedItemsForFeed(feedId, result);
    if (feed.fetchFullContent) {
      const candidates = fetchedItems
        .filter((item) => item.link && !existingItems.get(item.id)?.fullContentFetchedAt)
        .slice(0, MAX_AUTO_ARTICLE_FETCHES_PER_CYCLE);
      for (const item of candidates) {
        try {
          const article = await fetchArticle(item.link, {
            readerConfig: rssState(persistedState)?.webSearchConfig,
          });
          Object.assign(item, {
            fullContentHtml: article.contentHtml,
            fullContentText: article.contentText,
            fullContentUrl: article.url || item.link,
            fullContentFetchedAt: article.fetchedAt,
            fullContentError: undefined,
          });
        } catch (error) {
          item.fullContentError = error instanceof Error ? error.message : '原文抓取失败';
          logger.warn?.(`RSS 原文抓取失败（${item.title}）：${item.fullContentError}`);
        }
      }
    }
    await mutatePersistedState((nextPersistedState) => {
      const state = rssState(nextPersistedState);
      const currentFeed = state?.rssFeeds?.find((item) => item.id === feedId);
      if (!state || !currentFeed) return;
      const timestamp = Date.now();
      Object.assign(currentFeed, {
        siteUrl: result.siteUrl || currentFeed.siteUrl,
        description: result.description || currentFeed.description,
        lastFetchedAt: result.fetchedAt,
        lastSuccessAt: result.fetchedAt,
        lastError: undefined,
        lastErrorCode: undefined,
        updatedAt: timestamp,
      });
      state.rssItems = mergeFetchedItems(
        Array.isArray(state.rssItems) ? state.rssItems : [],
        feedId,
        fetchedItems,
      );
    });
    return { status: 'refreshed', feedId, itemCount: result.items.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : '刷新失败';
    await mutatePersistedState((nextPersistedState) => {
      const currentFeed = rssState(nextPersistedState)?.rssFeeds?.find((item) => item.id === feedId);
      if (!currentFeed) return;
      currentFeed.lastError = message;
      currentFeed.lastErrorCode = typeof error?.sourceCode === 'string' ? error.sourceCode : undefined;
      currentFeed.updatedAt = Date.now();
    }).catch(() => undefined);
    logger.warn?.(`RSS 订阅源刷新失败（${feed.title}）：${message}`);
    return { status: 'failed', feedId, error: message };
  }
}

const inFlightRefreshes = new Map();

export function refreshPersistedRssFeed(feedId, options = {}) {
  const current = inFlightRefreshes.get(feedId);
  if (current) return current;
  const operation = performPersistedRssRefresh(feedId, options).finally(() => {
    if (inFlightRefreshes.get(feedId) === operation) inFlightRefreshes.delete(feedId);
  });
  inFlightRefreshes.set(feedId, operation);
  return operation;
}

function shuffled(values, random) {
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
} = {}) {
  let active = false;
  let cycleTimer;
  const feedTimers = new Set();
  const sourceFetcher = fetchSource
    || (fetchFeed ? (source) => fetchFeed(source.feedUrl) : fetchRssSource);

  const clearTimers = () => {
    clearTimeout(cycleTimer);
    feedTimers.forEach((timer) => clearTimeout(timer));
    feedTimers.clear();
  };

  const scheduleCycle = (delay) => {
    clearTimeout(cycleTimer);
    cycleTimer = setTimeout(() => void runCycle(), delay);
    cycleTimer.unref?.();
  };

  const runCycle = async () => {
    if (!active) return 0;
    let feeds = [];
    try {
      const persistedState = await readPersistedState();
      feeds = shuffled(rssState(persistedState)?.rssFeeds ?? [], random).filter((feed) => {
        const source = normalizeRssSource(feed.source, feed.url);
        const minimumInterval = Math.max(intervalMs, sourceMinimumIntervalMs(source));
        return !feed.lastFetchedAt || now() - feed.lastFetchedAt >= minimumInterval;
      });
    } catch (error) {
      logger.warn?.(`无法读取 RSS 定时任务状态：${error instanceof Error ? error.message : String(error)}`);
    }
    const spacing = feeds.length
      ? Math.max(minFeedSpacingMs, Math.floor(intervalMs / feeds.length))
      : intervalMs;
    feeds.forEach((feed, index) => {
      const timer = setTimeout(() => {
        feedTimers.delete(timer);
        if (active) void refreshPersistedRssFeed(feed.id, { fetchSource: sourceFetcher, fetchArticle, logger });
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
    refreshFeed: (feedId) => refreshPersistedRssFeed(feedId, { fetchSource: sourceFetcher, fetchArticle, logger }),
  };
}
