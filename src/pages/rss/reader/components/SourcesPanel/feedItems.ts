import type { RssItem } from '../../../../../../contracts/rss';
import type { FetchedRssFeed } from '../../../../../api/rss/type';

export function fetchedItemsForFeed(feedId: string, result: FetchedRssFeed): RssItem[] {
  return result.items.map((item) => ({
    ...item,
    id: `${feedId}:${item.id}`,
    feedId,
    fetchedAt: result.fetchedAt,
  }));
}
