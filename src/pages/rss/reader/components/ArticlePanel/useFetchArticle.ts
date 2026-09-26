import { Toast } from '@douyinfe/semi-ui';
import { useCallback, useState, type MutableRefObject } from 'react';
import { rssApi } from '../../../../../api/rss';

import type { RssItem } from '../../../../../../contracts/rss';
import { useLearningStore } from '../../../../../store/useLearningStore';

export function useFetchArticle(selectedItemIdRef: MutableRefObject<string | null>) {
  const updateRssItem = useLearningStore((state) => state.updateRssItem);
  const [fetchingArticleIds, setFetchingArticleIds] = useState<Set<string>>(new Set());
  const fetchArticleContent = useCallback(
    async (item: RssItem) => {
      if (!item.link) {
        Toast.warning('这条内容没有可抓取的原文链接');
        return false;
      }
      setFetchingArticleIds((current) => new Set(current).add(item.id));
      try {
        const article = await rssApi.fetchArticle({ url: item.link });
        updateRssItem(item.id, {
          fullContentHtml: article.contentHtml,
          fullContentText: article.contentText,
          fullContentUrl: article.url || item.link,
          fullContentFetchedAt: article.fetchedAt,
          fullContentError: undefined,
          aiSummary: undefined,
          aiSummaryUpdatedAt: undefined,
          aiSummaryVersion: undefined,
          aiTranslation: undefined,
          aiTranslationHtml: undefined,
          aiTranslationUpdatedAt: undefined,
          aiTranslationSourceFetchedAt: undefined,
        });
        if (selectedItemIdRef.current === item.id) {
          Toast.success(item.fullContentFetchedAt ? '原文已重新抓取' : '原文已抓取');
        }
        return true;
      } catch (error) {
        const message = error instanceof Error ? error.message : '原文抓取失败';
        updateRssItem(item.id, { fullContentError: message });
        if (selectedItemIdRef.current === item.id) Toast.error(message);
        return false;
      } finally {
        setFetchingArticleIds((current) => {
          const next = new Set(current);
          next.delete(item.id);
          return next;
        });
      }
    },
    [selectedItemIdRef, updateRssItem],
  );

  return { fetchingArticleIds, fetchArticleContent };
}
