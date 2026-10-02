import type { RssFeed, RssFeedType, RssSource } from '../../../../../../contracts/rss';
import type { FetchedRssFeed } from '../../../../../api/rss/type';

export type RssSourceKind = RssSource['kind'];

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
