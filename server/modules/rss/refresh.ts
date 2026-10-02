import type { RssItem, RssSourceErrorCode, RssSource } from '../../../contracts/rss.js';
import type { fetchRssFeed } from './feed.js';
import type { FetchedRssFeed } from './types.js';
import { fetchRssArticle } from './article.js';
import { fetchRssSource, normalizeRssSource } from './sources.js';
import { mutatePersistedState, readPersistedState } from '../state/stateStore.js';
import { mergeFetchedItems } from './items.js';
import { rssState } from '../state/compatibility/rssState.js';

export interface RefreshOptions {
  fetchFeed?: typeof fetchRssFeed;
  fetchSource?: (source: RssSource) => Promise<FetchedRssFeed>;
  fetchArticle?: typeof fetchRssArticle;
  logger?: Pick<Console, 'warn'>;
}
const MAX_AUTO_ARTICLE_FETCHES_PER_CYCLE = 6;
const inFlightRefreshes = new Map<string, ReturnType<typeof performPersistedRssRefresh>>();

function fetchedItemsForFeed(
  feedId: string,
  result: Awaited<ReturnType<typeof fetchRssFeed>>,
): RssItem[] {
  return (Array.isArray(result?.items) ? result.items : []).map((item) => ({
    ...item,
    id: `${feedId}:${item.id}`,
    feedId,
    fetchedAt: result.fetchedAt,
  }));
}

async function performPersistedRssRefresh(
  feedId: string,
  { fetchFeed, fetchSource, fetchArticle = fetchRssArticle, logger = console }: RefreshOptions = {},
) {
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
      const currentFeed = rssState(nextPersistedState)?.rssFeeds?.find(
        (item) => item.id === feedId,
      );
      if (!currentFeed) return;
      currentFeed.lastError = message;
      const sourceCode = (error as { sourceCode?: unknown } | null)?.sourceCode;
      currentFeed.lastErrorCode =
        typeof sourceCode === 'string' ? (sourceCode as RssSourceErrorCode) : undefined;
      currentFeed.updatedAt = Date.now();
    }).catch(() => undefined);
    logger.warn?.(`RSS 订阅源刷新失败（${feed.title}）：${message}`);
    return { status: 'failed', feedId, error: message };
  }
}

export function refreshPersistedRssFeed(feedId: string, options: RefreshOptions = {}) {
  const current = inFlightRefreshes.get(feedId);
  if (current) return current;
  const operation = performPersistedRssRefresh(feedId, options).finally(() => {
    if (inFlightRefreshes.get(feedId) === operation) inFlightRefreshes.delete(feedId);
  });
  inFlightRefreshes.set(feedId, operation);
  return operation;
}
