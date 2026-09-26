import type { RssItem } from '../../../contracts/domain.js';

/** Provider items receive their feed identity and fetch time when merged into state. */
export type FetchedRssItem = Omit<RssItem, 'feedId' | 'fetchedAt'>;

export interface FetchedRssFeed {
  title: string;
  description: string;
  siteUrl: string;
  feedUrl: string;
  fetchedAt: number;
  items: FetchedRssItem[];
}
