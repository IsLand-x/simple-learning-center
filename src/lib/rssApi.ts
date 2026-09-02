import type { RssItem, RssSource } from '../types';
import type { AiJob } from './aiJobs';
import { serverRequest } from './serverApi';

export interface FetchedRssItem {
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

export interface BilibiliCredentialStatus {
  configured: boolean;
  verificationStatus: 'unconfigured' | 'unverified' | 'valid' | 'invalid';
  updatedAt?: number;
  lastVerifiedAt?: number;
  accountLabel?: string;
  message?: string;
}

export async function fetchRssFeed(url: string) {
  const response = await serverRequest('/api/rss/fetch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  return response.json() as Promise<FetchedRssFeed>;
}

export async function resolveRssSource(input: RssSourceInput) {
  const response = await serverRequest('/api/rss/sources/resolve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return response.json() as Promise<{ source: RssSource; result: FetchedRssFeed }>;
}

export async function fetchRssSource(source: RssSource) {
  const response = await serverRequest('/api/rss/sources/fetch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source }),
  });
  return response.json() as Promise<FetchedRssFeed>;
}

export async function getBilibiliCredentialStatus() {
  const response = await serverRequest('/api/source-credentials/bilibili');
  return response.json() as Promise<BilibiliCredentialStatus>;
}

export async function saveBilibiliCookie(cookie: string) {
  const response = await serverRequest('/api/source-credentials/bilibili', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cookie }),
  });
  return response.json() as Promise<BilibiliCredentialStatus>;
}

export async function verifySavedBilibiliCookie() {
  const response = await serverRequest('/api/source-credentials/bilibili/verify', { method: 'POST' });
  return response.json() as Promise<BilibiliCredentialStatus>;
}

export async function deleteSavedBilibiliCookie() {
  const response = await serverRequest('/api/source-credentials/bilibili', { method: 'DELETE' });
  return response.json() as Promise<BilibiliCredentialStatus>;
}

export async function fetchRssArticle(url: string) {
  const response = await serverRequest('/api/rss/article', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  return response.json() as Promise<FetchedRssArticle>;
}

export async function generateRssDigest(date?: string, force = true) {
  const response = await serverRequest('/api/rss/digests/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date, force }),
  });
  return response.json() as Promise<{ job?: AiJob; skipped?: boolean }>;
}

export function fetchedItemsForFeed(feedId: string, result: FetchedRssFeed): RssItem[] {
  return result.items.map((item) => ({
    ...item,
    id: `${feedId}:${item.id}`,
    feedId,
    fetchedAt: result.fetchedAt,
  }));
}
