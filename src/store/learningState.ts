import type { StoreApi } from 'zustand';
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
} from '../types';

export interface LearningState {
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
  addBooks: (books: BookItem[]) => void;
  setBookCovers: (covers: Record<string, string>) => void;
  updateBook: (bookId: string, changes: Partial<BookItem>) => void;
  trashBook: (bookId: string, deletedAt?: number) => void;
  restoreBook: (bookId: string, restoredAt?: number) => void;
  deleteBookPermanently: (bookId: string, deletedAt?: number) => void;
  createBookList: (bookList: BookList) => void;
  updateBookList: (bookListId: string, changes: Partial<Pick<BookList, 'name' | 'note'>>) => void;
  deleteBookList: (bookListId: string) => void;
  setBookListBooks: (bookListId: string, bookIds: string[]) => void;
  moveBookInList: (bookListId: string, sourceIndex: number, destinationIndex: number) => void;
  removeBookFromList: (bookListId: string, bookId: string) => void;
  addHighlight: (highlight: HighlightItem) => void;
  updateHighlight: (highlightId: string, changes: Partial<Pick<HighlightItem, 'comment'>>) => void;
  deleteHighlight: (highlightId: string) => void;
  addNote: (note: NoteItem) => void;
  setBookNoteContent: (bookId: string, bookTitle: string, content: string) => void;
  updateNote: (
    noteId: string,
    changes: Partial<Pick<NoteItem, 'title' | 'content' | 'fileName'>>,
  ) => void;
  deleteNote: (noteId: string) => void;
  createChatSession: (session: ChatSession) => void;
  updateChatSession: (sessionId: string, changes: Partial<ChatSession>) => void;
  deleteChatSession: (sessionId: string) => void;
  addChatMessage: (message: ChatMessage) => void;
  clearBookChats: (bookId: string) => void;
  upsertReadingSession: (session: ReadingSession) => void;
  addRssFolder: (folder: RssFolder) => void;
  updateRssFolder: (folderId: string, changes: Partial<Pick<RssFolder, 'name'>>) => void;
  moveRssFolder: (folderId: string, beforeFolderId?: string) => void;
  deleteRssFolder: (folderId: string) => void;
  upsertRssFeed: (feed: RssFeed) => void;
  updateRssFeed: (feedId: string, changes: Partial<RssFeed>) => void;
  moveRssFeed: (feedId: string, folderId?: string, beforeFeedId?: string) => void;
  deleteRssFeed: (feedId: string) => void;
  mergeRssItems: (feedId: string, items: RssItem[]) => void;
  updateRssItem: (itemId: string, changes: Partial<RssItem>) => void;
  addRssAnnotation: (annotation: RssAnnotation) => void;
  updateRssAnnotation: (
    annotationId: string,
    changes: Partial<Pick<RssAnnotation, 'comment' | 'commentUpdatedAt'>>,
  ) => void;
  deleteRssAnnotation: (annotationId: string) => void;
  upsertRssDailyDigest: (digest: RssDailyDigest) => void;
  setRssDigestSettings: (changes: Partial<RssDigestSettings>) => void;
  markRssItemsRead: (itemIds?: string[]) => void;
  markRssItemsUnread: (itemIds?: string[]) => void;
  setRssPanelWidth: (width: number) => void;
  upsertVideoResource: (video: VideoResource) => void;
  updateVideoResource: (videoId: string, changes: Partial<VideoResource>) => void;
  deleteVideoResource: (videoId: string) => void;
  addVideoTimestampNote: (note: VideoTimestampNote) => void;
  updateVideoTimestampNote: (
    noteId: string,
    changes: Partial<Pick<VideoTimestampNote, 'content'>>,
  ) => void;
  deleteVideoTimestampNote: (noteId: string) => void;
  setVideoPanelWidth: (width: number) => void;
  addOpenAIConfig: (config: OpenAICompatibleConfig) => void;
  updateOpenAIConfig: (configId: string, changes: Partial<OpenAICompatibleConfig>) => void;
  deleteOpenAIConfig: (configId: string) => void;
  setWebSearchConfig: (changes: Partial<WebSearchConfig>) => void;
  setAiPreferences: (changes: Partial<AiPreferences>) => void;
  setNavCollapsed: (collapsed: boolean) => void;
  setThemeMode: (theme: ThemeMode) => void;
  setReaderPreferences: (changes: Partial<ReaderPreferences>) => void;
}

export type LearningStoreSet = StoreApi<LearningState>['setState'];
