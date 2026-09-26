import type {
  AiPreferences,
  BookItem,
  BookList,
  ChatMessage,
  ChatSession,
  DeletedBookTombstone,
  DeletedHighlightTombstone,
  HighlightItem,
  NoteItem,
  OpenAICompatibleConfig,
  ReaderPreferences,
  ReadingSession,
  RssAnnotation,
  RssDailyDigest,
  RssDigestRun,
  RssDigestSettings,
  RssFeed,
  RssFolder,
  RssItem,
  ThemeMode,
  TrashedBookItem,
  VideoResource,
  VideoTimestampNote,
  WebSearchConfig,
} from '../../../contracts/domain.js';

// Older clients can omit domains. Unknown fields survive snapshots and disk writes.
export interface StoredState {
  books?: Array<BookItem & { deletedAt?: number }>;
  bookLists?: BookList[];
  trashedBooks?: TrashedBookItem[];
  deletedBookTombstones?: DeletedBookTombstone[];
  highlights?: HighlightItem[];
  deletedHighlightTombstones?: DeletedHighlightTombstone[];
  notes?: NoteItem[];
  readingSessions?: ReadingSession[];
  chats?: ChatMessage[];
  chatSessions?: ChatSession[];
  rssFolders?: RssFolder[];
  rssFeeds?: RssFeed[];
  rssItems?: RssItem[];
  rssAnnotations?: RssAnnotation[];
  rssDailyDigests?: RssDailyDigest[];
  rssDigestRuns?: RssDigestRun[];
  rssDigestSettings?: Partial<RssDigestSettings>;
  rssPanelWidth?: number;
  videoResources?: VideoResource[];
  videoTimestampNotes?: VideoTimestampNote[];
  videoPanelWidth?: number;
  openAIConfigs?: OpenAICompatibleConfig[];
  webSearchConfig?: WebSearchConfig;
  aiPreferences?: Partial<AiPreferences>;
  navCollapsed?: boolean;
  themeMode?: ThemeMode;
  readerPreferences?: Partial<ReaderPreferences>;
  readerPreferencesUpdatedAt?: number;
  readerStyleUpdatedAt?: number;
  readerLayoutUpdatedAt?: number;
  [field: string]: unknown;
}

export interface PersistedState {
  state: StoredState;
  version: number;
  [field: string]: unknown;
}
