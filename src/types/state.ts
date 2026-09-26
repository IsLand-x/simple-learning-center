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
} from '../../contracts/domain';

export interface LearningData {
  books: BookItem[];
  bookLists: BookList[];
  trashedBooks: TrashedBookItem[];
  deletedBookTombstones: DeletedBookTombstone[];
  deletedHighlightTombstones: DeletedHighlightTombstone[];
  highlights: HighlightItem[];
  notes: NoteItem[];
  chats: ChatMessage[];
  chatSessions: ChatSession[];
  readingSessions: ReadingSession[];
  rssFolders: RssFolder[];
  rssFeeds: RssFeed[];
  rssItems: RssItem[];
  rssAnnotations: RssAnnotation[];
  rssDailyDigests: RssDailyDigest[];
  rssDigestRuns: RssDigestRun[];
  rssDigestSettings: RssDigestSettings;
  rssPanelWidth: number;
  videoResources: VideoResource[];
  videoTimestampNotes: VideoTimestampNote[];
  videoPanelWidth: number;
  openAIConfigs: OpenAICompatibleConfig[];
  webSearchConfig: WebSearchConfig;
  aiPreferences: AiPreferences;
  navCollapsed: boolean;
  themeMode: ThemeMode;
  readerPreferences: ReaderPreferences;
  readerPreferencesUpdatedAt: number;
  readerStyleUpdatedAt: number;
  readerLayoutUpdatedAt: number;
}

export interface StateDomainData {
  library: Pick<LearningData, 'books' | 'bookLists' | 'trashedBooks' | 'deletedBookTombstones'>;
  reading: Pick<
    LearningData,
    'highlights' | 'deletedHighlightTombstones' | 'notes' | 'readingSessions'
  >;
  conversations: Pick<LearningData, 'chats' | 'chatSessions'>;
  rss: Pick<
    LearningData,
    | 'rssFolders'
    | 'rssFeeds'
    | 'rssItems'
    | 'rssAnnotations'
    | 'rssDailyDigests'
    | 'rssDigestRuns'
    | 'rssDigestSettings'
    | 'rssPanelWidth'
  >;
  videos: Pick<LearningData, 'videoResources' | 'videoTimestampNotes' | 'videoPanelWidth'>;
  preferences: Pick<
    LearningData,
    | 'openAIConfigs'
    | 'webSearchConfig'
    | 'aiPreferences'
    | 'navCollapsed'
    | 'themeMode'
    | 'readerPreferences'
    | 'readerPreferencesUpdatedAt'
    | 'readerStyleUpdatedAt'
    | 'readerLayoutUpdatedAt'
  >;
}

export type StateDomain = keyof StateDomainData;

// Legacy snapshots can omit fields until their existing migrations have run.
export interface PersistedStateEnvelope {
  state?: Partial<LearningData>;
  version?: number;
}

export interface StateDomainSnapshot<Domain extends StateDomain = StateDomain> {
  state: Partial<StateDomainData[Domain]>;
  version: number;
}

export type StateDomainResponse<Domain extends StateDomain = StateDomain> =
  | { status: 204; etag: string | null }
  | { status: 304; etag: string | null }
  | { status: 200; etag: string | null; snapshot: StateDomainSnapshot<Domain> };
