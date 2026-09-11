import type { RssMobilePanel, RssMobileView } from '../../../components/RssMobileWorkspace';
import { findRssSearchMatches } from '../../../lib/rssContent';
import type { FetchedRssFeed } from '../../../lib/rssApi';
import type { RssFeed, RssFeedType, RssItem, RssSource } from '../../../types';

export type TimeRange = 'today' | 'seven-days' | 'all';
export type RssSidePanel = 'ai' | 'timeline' | 'comments' | null;
export type RssSourceKind = RssSource['kind'];

export interface RssImageViewerImage {
  src: string;
  alt: string;
}

export const RSS_FOLDER_DRAG_TYPE = 'rss-folder';
export const RSS_FEED_DRAG_TYPE = 'rss-feed';
export const RSS_FOLDER_DROPPABLE_ID = 'rss-folders';
export const RSS_UNFILED_DROPPABLE_ID = 'rss-feeds:unfiled';
export const RSS_FOLDER_DRAG_PREFIX = 'rss-folder:';
export const RSS_FEED_DRAG_PREFIX = 'rss-feed:';
const RSS_FOLDER_FEEDS_PREFIX = 'rss-feeds:folder:';
export const RSS_SMART_SOURCE_IDS = new Set(['daily', 'all', 'unread', 'bookmarked']);

export const feedTypeLabels: Record<RssFeedType, string> = {
  article: '文章',
  video: '视频',
  social: '社交媒体',
};

export function isRssMobileView(value: string | null): value is RssMobileView {
  return value === 'sources' || value === 'items' || value === 'detail';
}

export function isRssMobilePanel(value: string | null): value is Exclude<RssMobilePanel, null> {
  return value === 'style' || value === 'ai' || value === 'timeline';
}

export function rssItemContentText(item: RssItem) {
  return item.fullContentText || item.contentText;
}

export function rssSearchPreview(item: RssItem, query: string) {
  const normalizedContent = rssItemContentText(item).replace(/\s+/g, ' ').trim();
  const [contentMatch] = findRssSearchMatches(normalizedContent, query);
  if (contentMatch) {
    const start = Math.max(0, contentMatch.start - 34);
    const end = Math.min(normalizedContent.length, contentMatch.end + 58);
    return `${start > 0 ? '…' : ''}${normalizedContent.slice(start, end)}${end < normalizedContent.length ? '…' : ''}`;
  }
  if (item.author && findRssSearchMatches(item.author, query).length) return `作者：${item.author}`;
  return '';
}

const DIGEST_MARKDOWN_CHARACTERS = new Set(['#', '*', '_', '>', '`', '[', ']', '(', ')']);

export function digestPreview(content: string) {
  return [...content]
    .filter((character) => !DIGEST_MARKDOWN_CHARACTERS.has(character))
    .join('')
    .replace(/\s+/g, ' ')
    .slice(0, 92);
}

export function folderFeedsDroppableId(folderId: string) {
  return `${RSS_FOLDER_FEEDS_PREFIX}${folderId}`;
}

export function folderIdFromFeedsDroppable(droppableId: string) {
  if (droppableId === RSS_UNFILED_DROPPABLE_ID) return undefined;
  if (!droppableId.startsWith(RSS_FOLDER_FEEDS_PREFIX)) return null;
  return droppableId.slice(RSS_FOLDER_FEEDS_PREFIX.length);
}

export function isTimeRange(value: string | null): value is TimeRange {
  return value === 'today' || value === 'seven-days' || value === 'all';
}

export function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export function localDateKey(timestamp = Date.now()) {
  return new Date(timestamp).toLocaleDateString('en-CA');
}

export function digestDateLabel(date: string) {
  const timestamp = new Date(`${date}T00:00:00`).getTime();
  if (!Number.isFinite(timestamp)) return date;
  if (date === localDateKey()) return '今天';
  return new Intl.DateTimeFormat('zh-CN', {
    year: new Date(timestamp).getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  }).format(timestamp);
}

export function itemTime(timestamp: number) {
  const date = new Date(timestamp);
  const includeYear = date.getFullYear() !== new Date().getFullYear();
  return new Intl.DateTimeFormat('zh-CN', {
    ...(includeYear ? { year: 'numeric' } : {}),
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

export function itemDateTime(timestamp: number) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(timestamp);
}

export function rssSourceKey(source: RssSource) {
  switch (source.kind) {
    case 'rss':
      return `rss:${source.feedUrl}`;
    case 'bilibili-weekly':
      return source.kind;
    case 'bilibili-up':
      return `${source.kind}:${source.uid}`;
    case 'youtube-channel':
      return `${source.kind}:${source.channelId}`;
  }
}

export function sourceTypeLabel(source: RssSource) {
  switch (source.kind) {
    case 'rss':
      return 'RSS / Atom';
    case 'bilibili-weekly':
      return 'B站每周必看';
    case 'bilibili-up':
      return `B站 UP · ${source.uid}`;
    case 'youtube-channel':
      return `YouTube · ${source.channelId}`;
  }
}

export function normalizedFeed(
  feedId: string,
  type: RssFeedType,
  folderId: string | undefined,
  result: FetchedRssFeed,
  source: RssSource,
  title?: string,
  fetchFullContent = false,
): RssFeed {
  const timestamp = Date.now();
  return {
    id: feedId,
    title: title?.trim() || result.title,
    url: result.feedUrl,
    source,
    siteUrl: result.siteUrl || undefined,
    description: result.description || undefined,
    type,
    fetchFullContent,
    ...(folderId ? { folderId } : {}),
    createdAt: timestamp,
    updatedAt: timestamp,
    lastFetchedAt: result.fetchedAt,
    lastSuccessAt: result.fetchedAt,
  };
}
