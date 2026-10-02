import type { RssSource } from '../../../contracts/rss';
import type { AiJob } from '../ai/type';

interface FetchedRssItem {
  id: string;
  title: string;
  link: string;
  author: string;
  publishedAt: number;
  publishedAtIsFallback?: boolean;
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

export interface FetchedRssArticle {
  title: string;
  byline: string;
  excerpt: string;
  contentHtml: string;
  contentText: string;
  url: string;
  fetchedAt: number;
}

export type RssSourceInput =
  | { kind: 'rss'; input: string }
  | { kind: 'bilibili-weekly' }
  | { kind: 'bilibili-up'; input: string }
  | { kind: 'youtube-channel'; input: string };

export interface ResolveRssSourceResponse {
  source: RssSource;
  result: FetchedRssFeed;
}

export interface FetchRssSourceRequest {
  source: RssSource;
}

export interface FetchRssArticleRequest {
  url: string;
}

export interface GenerateRssDigestRequest {
  date?: string;
  force: boolean;
}

export type GenerateRssDigestResponse =
  { job: AiJob; skipped: false } | { job?: undefined; skipped: true };
