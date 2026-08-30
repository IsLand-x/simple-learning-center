import type { RssItem } from '../types';
import { serverRequest } from './serverApi';

export interface FetchedRssItem {
  id: string;
  title: string;
  link: string;
  author: string;
  publishedAt: number;
  contentText: string;
  contentHtml?: string;
  imageUrl?: string;
  imageUrls?: string[];
}

export interface FetchedRssFeed {
  title: string;
  description: string;
  siteUrl: string;
  feedUrl: string;
  fetchedAt: number;
  items: FetchedRssItem[];
}

export async function fetchRssFeed(url: string) {
  const response = await serverRequest('/api/rss/fetch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  return response.json() as Promise<FetchedRssFeed>;
}

export function fetchedItemsForFeed(feedId: string, result: FetchedRssFeed): RssItem[] {
  return result.items.map((item) => ({
    ...item,
    id: `${feedId}:${item.id}`,
    feedId,
    fetchedAt: result.fetchedAt,
  }));
}
