import type { LearningData } from '../api/state/type';
import type { StoreApi } from 'zustand';
import type {
  AiPreferences,
  ChatMessage,
  ChatSession,
  OpenAICompatibleConfig,
} from '../../contracts/ai';
import type { BookItem, BookList } from '../../contracts/books';
import type {
  HighlightItem,
  NoteItem,
  ReaderPreferences,
  ReadingSession,
} from '../../contracts/reading';
import type {
  RssAnnotation,
  RssDailyDigest,
  RssDigestSettings,
  RssFeed,
  RssFolder,
  RssItem,
} from '../../contracts/rss';
import type { ThemeMode, WebSearchConfig } from '../../contracts/settings';
import type { VideoResource, VideoTimestampNote } from '../../contracts/videos';

export interface LearningState extends LearningData {
  addBooks: (books: BookItem[]) => void;
  setBookCovers: (covers: Record<string, string>) => void;
  updateBook: (bookId: string, changes: Partial<BookItem>) => void;
  trashBook: (bookId: string, deletedAt?: number) => void;
  restoreBook: (bookId: string, restoredAt?: number) => void;
  deleteBookPermanently: (bookId: string, deletedAt?: number) => void;
  createBookList: (bookList: BookList) => void;
  updateBookList: (bookListId: string, changes: Partial<Pick<BookList, 'name' | 'note'>>) => void;
  deleteBookList: (bookListId: string) => void;
  moveBookList: (bookListId: string, destinationIndex: number) => void;
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
  markChatMessagesRead: (messageIds: string[]) => void;
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
