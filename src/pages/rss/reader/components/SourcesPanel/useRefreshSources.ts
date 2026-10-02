import { Toast } from '@douyinfe/semi-ui';
import { useCallback, useState } from 'react';
import { ServerApiError } from '../../../../../api/http/errors';
import { rssApi } from '../../../../../api/rss';
import { fetchedItemsForFeed } from './feedItems';

import type { RssFeed, RssSourceErrorCode } from '../../../../../../contracts/rss';
import { useLearningStore } from '../../../../../store/useLearningStore';

const RSS_AUTO_ARTICLE_FETCH_LIMIT = 6;
export function useRefreshSources() {
  const mergeRssItems = useLearningStore((state) => state.mergeRssItems);
  const updateRssFeed = useLearningStore((state) => state.updateRssFeed);
  const [refreshingIds, setRefreshingIds] = useState<Set<string>>(new Set());
  const refreshFeed = useCallback(
    async (feed: RssFeed) => {
      setRefreshingIds((current) => new Set(current).add(feed.id));
      try {
        const result = await rssApi.fetchSource({ source: feed.source });
        const fetchedItems = fetchedItemsForFeed(feed.id, result);
        if (feed.fetchFullContent) {
          const existingItems = new Map(
            useLearningStore
              .getState()
              .rssItems.filter((item) => item.feedId === feed.id)
              .map((item) => [item.id, item]),
          );
          const candidates = fetchedItems
            .filter((item) => item.link && !existingItems.get(item.id)?.fullContentFetchedAt)
            .slice(0, RSS_AUTO_ARTICLE_FETCH_LIMIT);
          for (const item of candidates) {
            try {
              const article = await rssApi.fetchArticle({ url: item.link });
              Object.assign(item, {
                fullContentHtml: article.contentHtml,
                fullContentText: article.contentText,
                fullContentUrl: article.url || item.link,
                fullContentFetchedAt: article.fetchedAt,
                fullContentError: undefined,
              });
            } catch (error) {
              item.fullContentError = error instanceof Error ? error.message : '原文抓取失败';
            }
          }
        }
        mergeRssItems(feed.id, fetchedItems);
        updateRssFeed(feed.id, {
          title: feed.title || result.title,
          url: result.feedUrl,
          siteUrl: result.siteUrl || feed.siteUrl,
          description: result.description || feed.description,
          lastFetchedAt: result.fetchedAt,
          lastSuccessAt: result.fetchedAt,
          lastError: undefined,
          lastErrorCode: undefined,
        });
        return true;
      } catch (error) {
        updateRssFeed(feed.id, {
          lastError: error instanceof Error ? error.message : '刷新失败',
          lastErrorCode:
            error instanceof ServerApiError
              ? (error.code as RssSourceErrorCode | undefined)
              : undefined,
        });
        return false;
      } finally {
        setRefreshingIds((current) => {
          const next = new Set(current);
          next.delete(feed.id);
          return next;
        });
      }
    },
    [mergeRssItems, updateRssFeed],
  );

  const refreshFeeds = useCallback(
    async (targets: RssFeed[], notify = true) => {
      if (!targets.length) {
        if (notify) Toast.info('还没有订阅源');
        return;
      }
      let failed = 0;
      for (const feed of targets) {
        if (!(await refreshFeed(feed))) failed += 1;
      }
      if (!notify) return;
      if (failed) Toast.warning(`${targets.length - failed} 个订阅源已刷新，${failed} 个失败`);
      else Toast.success('订阅源已刷新');
    },
    [refreshFeed],
  );

  return { refreshingIds, refreshFeed, refreshFeeds };
}
