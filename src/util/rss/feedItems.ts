import type { RssItem } from '../../types/domain';
import type { FetchedRssFeed } from '../../types/rss';

export function fetchedItemsForFeed(feedId: string, result: FetchedRssFeed): RssItem[] {
  return result.items.map((item) => ({
    ...item,
    id: `${feedId}:${item.id}`,
    feedId,
    fetchedAt: result.fetchedAt,
  }));
}
