export type ThemeMode = 'light' | 'dark';
export type ReaderTheme =
  | 'paper'
  | 'ivory'
  | 'mist'
  | 'celadon'
  | 'twilight'
  | 'rice'
  | 'azure'
  | 'ink'
  | 'custom';
export type ReaderFont =
  | 'system-serif'
  | 'source-serif'
  | 'sans'
  | 'kai'
  | 'bright'
  | 'pingfang';
export type ReaderDensity = 'compact' | 'balanced' | 'relaxed';
export type ReaderTexture = 'none' | 'paper' | 'grain';
export type AiProvider = `api:${string}`;
export type RightPanel = 'ai' | 'history' | 'notes' | 'highlights' | 'comments' | 'trajectory' | null;
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

export interface VideoCaptionCue {
  startSeconds: number;
  durationSeconds: number;
  text: string;
}

export interface VideoResource {
  id: string;
  youtubeVideoId: string;
  url: string;
  title: string;
  channelId?: string;
  channelTitle: string;
  description?: string;
  durationSeconds: number;
  captions: {
    originalLanguage: string;
    originalLanguageLabel: string;
    original: VideoCaptionCue[];
    chinese: VideoCaptionCue[];
    error?: string;
  };
  lastPositionSeconds?: number;
  createdAt: number;
  updatedAt: number;
}

export interface VideoTimestampNote {
  id: string;
  videoId: string;
  timeSeconds: number;
  content: string;
  quoteOriginal?: string;
  quoteChinese?: string;
  createdAt: number;
  updatedAt: number;
}

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
  bookmarkedAt?: number;
  aiSummary?: string;
  aiSummaryUpdatedAt?: number;
  aiSummaryVersion?: number;
  aiTranslation?: string;
  aiTranslationHtml?: string;
  aiTranslationUpdatedAt?: number;
  aiTranslationSourceFetchedAt?: number;
}

export type RssDigestScheduleMode = 'every-2-hours' | 'every-4-hours' | 'fixed-times';

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

export type RssDigestRunTrigger = 'manual' | 'schedule';
export type RssDigestRunStatus = 'queued' | 'running' | 'completed' | 'failed' | 'skipped' | 'cancelled';

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

export interface TocItem {
  id: string;
  href: string;
  label: string;
  subitems?: TocItem[];
}

export interface BookItem {
  id: string;
  kind: 'demo' | 'epub';
  title: string;
  author: string;
  fileName: string;
  fileSize: number;
  coverDataUrl?: string;
  createdAt: number;
  updatedAt: number;
  progress: number;
  currentCfi?: string;
  currentChapter: string;
  currentPage?: number;
  totalPages?: number;
  toc: TocItem[];
}

export interface BookList {
  id: string;
  name: string;
  note: string;
  bookIds: string[];
  createdAt: number;
  updatedAt: number;
}

export interface TrashedBookItem {
  book: BookItem;
  deletedAt: number;
  bookListPositions: Array<{
    bookListId: string;
    index: number;
  }>;
}

export interface DeletedBookTombstone {
  bookId: string;
  deletedAt: number;
}

export interface HighlightItem {
  id: string;
  bookId: string;
  kind?: 'highlight' | 'comment';
  text: string;
  cfi: string;
  chapter: string;
  page?: number;
  comment?: string;
  commentUpdatedAt?: number;
  createdAt: number;
}

export interface NoteItem {
  id: string;
  bookId: string;
  title: string;
  content: string;
  fileName?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ChatMessage {
  id: string;
  bookId: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  dialogueContent?: AiDialogueContentItem[];
  quote?: {
    text: string;
    chapter: string;
  };
  createdAt: number;
}

export interface AiDialogueContentItem {
  type?: string;
  status?: string;
  [key: string]: unknown;
}

export interface ChatSession {
  id: string;
  bookId: string;
  title: string;
  provider?: AiProvider;
  model?: string;
  createdAt: number;
  updatedAt: number;
}

export interface OpenAICompatibleConfig {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  models: string[];
  createdAt: number;
  updatedAt: number;
}

export interface WebSearchConfig {
  provider: 'jina';
  apiKey: string;
}

export interface AiPreferences {
  provider: AiProvider | null;
  model: string;
}

export interface ReadingSession {
  id: string;
  bookId: string;
  startedAt: number;
  endedAt: number;
  durationMs: number;
}

export interface ReaderPreferences {
  fontSize: number;
  lineHeight: number;
  theme: ReaderTheme;
  fontFamily: ReaderFont;
  customStyle: ReaderCustomStyle;
  tocWidth: number;
  panelWidth: number;
  tocCollapsed: boolean;
}

export interface ReaderCustomStyle {
  fontFamily: ReaderFont;
  paperColor: string;
  textColor: string;
  texture: ReaderTexture;
  fontSize: number;
  density: ReaderDensity;
}

export interface ReaderSelection {
  text: string;
  cfi: string;
  rect: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
}

export interface ReaderHighlightTarget {
  highlightId: string;
  rect: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
}
