import type {
  ConversationDraft,
  AiPreferences,
  ChatMessage,
  ChatSession,
  OpenAICompatibleConfig,
} from './ai.js';
import type { BookItem, BookList, DeletedBookTombstone, TrashedBookItem } from './books.js';
import type {
  ChapterMindMap,
  ChapterVideo,
  DeletedHighlightTombstone,
  DeletedNoteTombstone,
  HighlightItem,
  NoteItem,
  ReaderPreferences,
  ReadingSession,
} from './reading.js';
import type { ThemeMode, WebSearchConfig } from './settings.js';

export interface LearningData {
  books: BookItem[];
  bookLists: BookList[];
  trashedBooks: TrashedBookItem[];
  deletedBookTombstones: DeletedBookTombstone[];
  deletedHighlightTombstones: DeletedHighlightTombstone[];
  highlights: HighlightItem[];
  notes: NoteItem[];
  deletedNoteTombstones: DeletedNoteTombstone[];
  chats: ChatMessage[];
  chatSessions: ChatSession[];
  readingSessions: ReadingSession[];
  chapterMindMaps: ChapterMindMap[];
  chapterVideos: ChapterVideo[];
  openAIConfigs: OpenAICompatibleConfig[];
  webSearchConfig: WebSearchConfig;
  conversationDrafts: ConversationDraft[];
  aiPreferences: AiPreferences;
  navCollapsed: boolean;
  themeMode: ThemeMode;
  readerPreferences: ReaderPreferences;
  readerPreferencesUpdatedAt: number;
  readerStyleUpdatedAt: number;
  readerLayoutUpdatedAt: number;
}

// 已停用的 RSS 与独立视频字段仅用于旧快照与服务端保护，不进入客户端活动状态。
export interface LegacyLearningData {
  rssFolders: unknown[];
  rssFeeds: Array<{ id: string }>;
  rssItems: Array<{ id: string; feedId: string }>;
  rssAnnotations: unknown[];
  rssDailyDigests: unknown[];
  rssDigestRuns: unknown[];
  rssDigestSettings: Record<string, unknown>;
  rssPanelWidth: number;
  videoResources: Array<{ id: string }>;
  videoTimestampNotes: unknown[];
  videoPanelWidth: number;
}

// 精确元组同时约束分区归属、完整字段和顺序，保持两端快照及 ETag 一致。
export interface StateDomainFields {
  library: readonly ['books', 'bookLists', 'trashedBooks', 'deletedBookTombstones'];
  reading: readonly ['readingSessions', 'chapterMindMaps', 'chapterVideos'];
  notes: readonly ['notes', 'deletedNoteTombstones'];
  highlights: readonly ['highlights', 'deletedHighlightTombstones'];
  conversations: readonly ['chats', 'chatSessions'];
  preferences: readonly [
    'openAIConfigs',
    'webSearchConfig',
    'aiPreferences',
    'conversationDrafts',
    'navCollapsed',
    'themeMode',
    'readerPreferences',
    'readerPreferencesUpdatedAt',
    'readerStyleUpdatedAt',
    'readerLayoutUpdatedAt',
  ];
}

// 服务端兼容旧分区；客户端只使用 StateDomainFields。
export interface LegacyStateDomainFields {
  rss: readonly [
    'rssFolders',
    'rssFeeds',
    'rssItems',
    'rssAnnotations',
    'rssDailyDigests',
    'rssDigestRuns',
    'rssDigestSettings',
    'rssPanelWidth',
  ];
  videos: readonly ['videoResources', 'videoTimestampNotes', 'videoPanelWidth'];
}

export type StateDomain = keyof StateDomainFields;

export type StateDomainData = {
  [Domain in StateDomain]: Pick<LearningData, StateDomainFields[Domain][number]>;
};
