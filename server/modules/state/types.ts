import type {
  AiPreferences,
  ChatMessage,
  ChatSession,
  OpenAICompatibleConfig,
} from '../../../contracts/ai.js';
import type {
  BookItem,
  BookList,
  DeletedBookTombstone,
  TrashedBookItem,
} from '../../../contracts/books.js';
import type {
  DeletedHighlightTombstone,
  HighlightItem,
  NoteItem,
  ReaderPreferences,
  ReadingSession,
} from '../../../contracts/reading.js';
import type {
  RssAnnotation,
  RssDailyDigest,
  RssDigestRun,
  RssDigestSettings,
  RssFeed,
  RssFolder,
  RssItem,
} from '../../../contracts/rss.js';
import type { ThemeMode, WebSearchConfig } from '../../../contracts/settings.js';
import type { VideoResource, VideoTimestampNote } from '../../../contracts/videos.js';

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
