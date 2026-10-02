import type { AiProvider } from './ai';
export type RssFeedType = 'article' | 'video' | 'social';

export type RssSource =
  | { kind: 'rss'; feedUrl: string }
  | { kind: 'bilibili-weekly' }
  | { kind: 'bilibili-up'; uid: string }
  | { kind: 'youtube-channel'; channelId: string; feedUrl: string };

export type RssSourceErrorCode =
  | 'SOURCE_INPUT_INVALID'
  | 'BILIBILI_COOKIE_REQUIRED'
  | 'BILIBILI_COOKIE_INVALID'
  | 'BILIBILI_RISK_CONTROL'
  | 'BILIBILI_UP_NOT_FOUND'
  | 'YOUTUBE_CHANNEL_NOT_FOUND'
  | 'UPSTREAM_RATE_LIMITED'
  | 'UPSTREAM_TIMEOUT'
  | 'UPSTREAM_UNAVAILABLE';

export interface RssFolder {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

export interface RssFeed {
  id: string;
  title: string;
  url: string;
  source: RssSource;
  siteUrl?: string;
  description?: string;
  type: RssFeedType;
  fetchFullContent?: boolean;
  folderId?: string;
  createdAt: number;
  updatedAt: number;
  lastFetchedAt?: number;
  lastSuccessAt?: number;
  lastError?: string;
  lastErrorCode?: RssSourceErrorCode;
}

export interface RssItem {
  id: string;
  feedId: string;
  title: string;
  link: string;
  author?: string;
  publishedAt: number;
  publishedAtIsFallback?: boolean;
  contentText: string;
  contentHtml?: string;
  fullContentHtml?: string;
  fullContentText?: string;
  fullContentUrl?: string;
  fullContentFetchedAt?: number;
  fullContentError?: string;
  imageUrl?: string;
  imageUrls?: string[];
  fetchedAt: number;
  readAt?: number;
  readStateUpdatedAt?: number;
  bookmarkedAt?: number;
  aiSummary?: string;
  aiSummaryUpdatedAt?: number;
  aiSummaryVersion?: number;
  aiTranslation?: string;
  aiTranslationHtml?: string;
  aiTranslationUpdatedAt?: number;
  aiTranslationSourceFetchedAt?: number;
}

type RssDigestScheduleMode = 'every-2-hours' | 'every-4-hours' | 'fixed-times';

export interface RssDigestSettings {
  enabled: boolean;
  provider: AiProvider | null;
  model: string;
  prompt: string;
  scheduleMode: RssDigestScheduleMode;
  times: string[];
  lastAttemptAt?: number;
  lastCompletedAt?: number;
  lastScheduledKey?: string;
  lastError?: string;
}

type RssDigestRunTrigger = 'manual' | 'schedule';

export type RssDigestRunStatus =
  'queued' | 'running' | 'completed' | 'failed' | 'skipped' | 'cancelled';

export interface RssDigestRun {
  id: string;
  date: string;
  trigger: RssDigestRunTrigger;
  status: RssDigestRunStatus;
  scheduleKey?: string;
  model?: string;
  itemCount: number;
  startedAt: number;
  updatedAt: number;
  completedAt?: number;
  message?: string;
}

export interface RssDailyDigest {
  id: string;
  date: string;
  content: string;
  sourceItemIds: string[];
  sourceFeedIds: string[];
  itemCount: number;
  model: string;
  generatedAt: number;
  updatedAt: number;
}

export interface RssAnnotation {
  id: string;
  itemId: string;
  kind: 'highlight' | 'comment';
  text: string;
  startOffset: number;
  endOffset: number;
  prefix?: string;
  suffix?: string;
  comment?: string;
  commentUpdatedAt?: number;
  createdAt: number;
}
