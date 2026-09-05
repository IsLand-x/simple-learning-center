import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { demoBooks } from '../data/demo';
import {
  DEFAULT_READER_CUSTOM_STYLE,
  legacyReaderPaperColor,
  normalizeReaderCustomStyle,
  readerDensityFromLineHeight,
} from '../lib/readerThemes';
import { markdownNoteTitle } from '../lib/markdownNotes';
import { serverStateStorage } from '../lib/serverStateStorage';
import type {
  AiPreferences,
  BookItem,
  BookList,
  ChatMessage,
  ChatSession,
  DeletedBookTombstone,
  HighlightItem,
  NoteItem,
  OpenAICompatibleConfig,
  ReaderCustomStyle,
  ReaderFont,
  ReaderPreferences,
  ReaderTheme,
  ReadingSession,
  RssDailyDigest,
  RssDigestRun,
  RssDigestSettings,
  RssFeed,
  RssFolder,
  RssItem,
  RssAnnotation,
  ThemeMode,
  TrashedBookItem,
  VideoResource,
  VideoTimestampNote,
  WebSearchConfig,
} from '../types';

const defaultReaderPreferences: ReaderPreferences = {
  fontSize: 18,
  lineHeight: 2,
  theme: 'paper',
  fontFamily: 'kai',
  customStyle: DEFAULT_READER_CUSTOM_STYLE,
  tocWidth: 272,
  panelWidth: 380,
  tocCollapsed: false,
};

const defaultAiPreferences: AiPreferences = {
  provider: null,
  model: '',
};

const LEGACY_RSS_DIGEST_PROMPT = '请把当天尚未读过的 RSS 内容整理成一份中文日报。先按事件和主题去重，再按重要性组织；每条结论说明发生了什么、为什么值得关注，并用 Markdown 链接附上对应订阅源原文。不要重复陈述同一事件，不要编造来源或正文中没有的信息。';

export const DEFAULT_RSS_DIGEST_PROMPT = '请把当天全部 RSS 内容整理成一份中文日报。先按事件和主题去重，再按重要性组织；每条结论说明发生了什么、为什么值得关注，并用 Markdown 链接附上对应订阅源原文。不要重复陈述同一事件，不要编造来源或正文中没有的信息。';

const defaultRssDigestSettings: RssDigestSettings = {
  enabled: false,
  provider: null,
  model: '',
  prompt: DEFAULT_RSS_DIGEST_PROMPT,
  scheduleMode: 'every-4-hours',
  times: ['08:00', '12:00', '18:00', '22:00'],
};

const defaultWebSearchConfig: WebSearchConfig = {
  provider: 'jina',
  apiKey: '',
};

function normalizeReaderFont(font: unknown): ReaderFont {
  if (font === 'kai' || font === 'wenkai-screen') return 'kai';
  if (font === 'source-serif') return 'source-serif';
  if (font === 'bright') return 'bright';
  if (font === 'sans') return 'sans';
  if (font === 'pingfang' || font === 'mi-lanting' || font === 'yahei') return 'pingfang';
  return 'system-serif';
}

function normalizeStoredCustomStyle(style: Partial<ReaderCustomStyle> | undefined) {
  return normalizeReaderCustomStyle({
    ...style,
    fontFamily: normalizeReaderFont(style?.fontFamily),
  });
}

function normalizeReaderTheme(theme: unknown): ReaderTheme {
  return theme === 'paper'
    || theme === 'ivory'
    || theme === 'mist'
    || theme === 'celadon'
    || theme === 'twilight'
    || theme === 'rice'
    || theme === 'azure'
    || theme === 'ink'
    || theme === 'custom'
    ? theme
    : 'custom';
}

function normalizeRssFeedSource(feed: RssFeed): RssFeed {
  const source = feed.source;
  if (source?.kind === 'rss' && typeof source.feedUrl === 'string' && source.feedUrl) return feed;
  if (source?.kind === 'bilibili-weekly') return feed;
  if (source?.kind === 'bilibili-up' && typeof source.uid === 'string' && source.uid) return feed;
  if (
    source?.kind === 'youtube-channel'
    && typeof source.channelId === 'string'
    && source.channelId
    && typeof source.feedUrl === 'string'
    && source.feedUrl
  ) return feed;
  return {
    ...feed,
    source: { kind: 'rss', feedUrl: feed.url },
  };
}

interface LearningState {
  books: BookItem[];
  bookLists: BookList[];
  trashedBooks: TrashedBookItem[];
  deletedBookTombstones: DeletedBookTombstone[];
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
  updateNote: (noteId: string, changes: Partial<Pick<NoteItem, 'title' | 'content' | 'fileName'>>) => void;
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
  updateRssAnnotation: (annotationId: string, changes: Partial<Pick<RssAnnotation, 'comment' | 'commentUpdatedAt'>>) => void;
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
  updateVideoTimestampNote: (noteId: string, changes: Partial<Pick<VideoTimestampNote, 'content'>>) => void;
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

export const useLearningStore = create<LearningState>()(
  persist(
    (set) => ({
      books: demoBooks,
      bookLists: [],
      trashedBooks: [],
      deletedBookTombstones: [],
      highlights: [],
      notes: [],
      chats: [],
      chatSessions: [],
      readingSessions: [],
      rssFolders: [],
      rssFeeds: [],
      rssItems: [],
      rssAnnotations: [],
      rssDailyDigests: [],
      rssDigestRuns: [],
      rssDigestSettings: defaultRssDigestSettings,
      rssPanelWidth: 380,
      videoResources: [],
      videoTimestampNotes: [],
      videoPanelWidth: 400,
      openAIConfigs: [],
      webSearchConfig: defaultWebSearchConfig,
      aiPreferences: defaultAiPreferences,
      navCollapsed: false,
      themeMode: 'light',
      readerPreferences: defaultReaderPreferences,
      addBooks: (books) =>
        set((state) => ({ books: [...books, ...state.books.filter((book) => !books.some((next) => next.id === book.id))] })),
      setBookCovers: (covers) =>
        set((state) => ({
          books: state.books.map((book) => (
            Object.hasOwn(covers, book.id) ? { ...book, coverDataUrl: covers[book.id] } : book
          )),
        })),
      updateBook: (bookId, changes) =>
        set((state) => ({
          books: state.books.map((book) =>
            book.id === bookId ? { ...book, ...changes, updatedAt: changes.updatedAt ?? Date.now() } : book,
          ),
        })),
      trashBook: (bookId, deletedAt = Date.now()) =>
        set((state) => {
          const book = state.books.find((item) => item.id === bookId);
          if (!book || state.trashedBooks.some((item) => item.book.id === bookId)) return state;
          const bookListPositions = state.bookLists.flatMap((bookList) => {
            const index = bookList.bookIds.indexOf(bookId);
            return index >= 0 ? [{ bookListId: bookList.id, index }] : [];
          });
          return {
            books: state.books.filter((item) => item.id !== bookId),
            trashedBooks: [
              { book, deletedAt, bookListPositions },
              ...state.trashedBooks.filter((item) => item.book.id !== bookId),
            ],
            deletedBookTombstones: state.deletedBookTombstones.filter((item) => item.bookId !== bookId),
            bookLists: state.bookLists.map((bookList) => (
              bookList.bookIds.includes(bookId)
                ? {
                  ...bookList,
                  bookIds: bookList.bookIds.filter((item) => item !== bookId),
                  updatedAt: deletedAt,
                }
                : bookList
            )),
          };
        }),
      restoreBook: (bookId, restoredAt = Date.now()) =>
        set((state) => {
          const trashedBook = state.trashedBooks.find((item) => item.book.id === bookId);
          if (!trashedBook) return state;
          const positions = new Map(
            trashedBook.bookListPositions.map((position) => [position.bookListId, position.index]),
          );
          return {
            books: state.books.some((book) => book.id === bookId)
              ? state.books
              : [trashedBook.book, ...state.books],
            trashedBooks: state.trashedBooks.filter((item) => item.book.id !== bookId),
            deletedBookTombstones: state.deletedBookTombstones.filter((item) => item.bookId !== bookId),
            bookLists: state.bookLists.map((bookList) => {
              const savedIndex = positions.get(bookList.id);
              if (!Number.isInteger(savedIndex) || bookList.bookIds.includes(bookId)) return bookList;
              const bookIds = [...bookList.bookIds];
              bookIds.splice(Math.min(Math.max(savedIndex!, 0), bookIds.length), 0, bookId);
              return { ...bookList, bookIds, updatedAt: restoredAt };
            }),
          };
        }),
      deleteBookPermanently: (bookId, deletedAt = Date.now()) =>
        set((state) => ({
          books: state.books.filter((book) => book.id !== bookId),
          trashedBooks: state.trashedBooks.filter((item) => item.book.id !== bookId),
          deletedBookTombstones: [
            { bookId, deletedAt },
            ...state.deletedBookTombstones.filter((item) => item.bookId !== bookId),
          ],
          bookLists: state.bookLists.map((bookList) => (
            bookList.bookIds.includes(bookId)
              ? {
                ...bookList,
                bookIds: bookList.bookIds.filter((item) => item !== bookId),
                updatedAt: deletedAt,
              }
              : bookList
          )),
          highlights: state.highlights.filter((highlight) => highlight.bookId !== bookId),
          notes: state.notes.filter((note) => note.bookId !== bookId),
          chats: state.chats.filter((message) => message.bookId !== bookId),
          chatSessions: state.chatSessions.filter((session) => session.bookId !== bookId),
          readingSessions: state.readingSessions.filter((session) => session.bookId !== bookId),
        })),
      createBookList: (bookList) =>
        set((state) => ({
          bookLists: [bookList, ...state.bookLists.filter((item) => item.id !== bookList.id)],
        })),
      updateBookList: (bookListId, changes) =>
        set((state) => ({
          bookLists: state.bookLists.map((bookList) => (
            bookList.id === bookListId
              ? { ...bookList, ...changes, updatedAt: Date.now() }
              : bookList
          )),
        })),
      deleteBookList: (bookListId) =>
        set((state) => ({
          bookLists: state.bookLists.filter((bookList) => bookList.id !== bookListId),
        })),
      setBookListBooks: (bookListId, bookIds) =>
        set((state) => {
          const availableBookIds = new Set(state.books.map((book) => book.id));
          const uniqueBookIds = [...new Set(bookIds)].filter((bookId) => availableBookIds.has(bookId));
          return {
            bookLists: state.bookLists.map((bookList) => (
              bookList.id === bookListId
                ? { ...bookList, bookIds: uniqueBookIds, updatedAt: Date.now() }
                : bookList
            )),
          };
        }),
      moveBookInList: (bookListId, sourceIndex, destinationIndex) =>
        set((state) => ({
          bookLists: state.bookLists.map((bookList) => {
            if (
              bookList.id !== bookListId
              || sourceIndex === destinationIndex
              || sourceIndex < 0
              || destinationIndex < 0
              || sourceIndex >= bookList.bookIds.length
              || destinationIndex >= bookList.bookIds.length
            ) return bookList;
            const bookIds = [...bookList.bookIds];
            const [bookId] = bookIds.splice(sourceIndex, 1);
            bookIds.splice(destinationIndex, 0, bookId);
            return { ...bookList, bookIds, updatedAt: Date.now() };
          }),
        })),
      removeBookFromList: (bookListId, bookId) =>
        set((state) => ({
          bookLists: state.bookLists.map((bookList) => (
            bookList.id === bookListId && bookList.bookIds.includes(bookId)
              ? {
                ...bookList,
                bookIds: bookList.bookIds.filter((item) => item !== bookId),
                updatedAt: Date.now(),
              }
              : bookList
          )),
        })),
      addHighlight: (highlight) =>
        set((state) => ({
          highlights: [highlight, ...state.highlights.filter((item) => item.id !== highlight.id)],
        })),
      updateHighlight: (highlightId, changes) =>
        set((state) => ({
          highlights: state.highlights.map((highlight) => {
            if (highlight.id !== highlightId) return highlight;
            const comment = changes.comment?.trim();
            if (!comment) {
              const { comment: _comment, commentUpdatedAt: _commentUpdatedAt, ...withoutComment } = highlight;
              return withoutComment;
            }
            return { ...highlight, comment, commentUpdatedAt: Date.now() };
          }),
        })),
      deleteHighlight: (highlightId) =>
        set((state) => ({ highlights: state.highlights.filter((item) => item.id !== highlightId) })),
      addNote: (note) => set((state) => ({ notes: [note, ...state.notes] })),
      updateNote: (noteId, changes) =>
        set((state) => ({
          notes: state.notes.map((note) =>
            note.id === noteId ? { ...note, ...changes, updatedAt: Date.now() } : note,
          ),
        })),
      deleteNote: (noteId) =>
        set((state) => ({ notes: state.notes.filter((note) => note.id !== noteId) })),
      createChatSession: (session) =>
        set((state) => ({
          chatSessions: [session, ...state.chatSessions.filter((item) => item.id !== session.id)],
        })),
      updateChatSession: (sessionId, changes) =>
        set((state) => ({
          chatSessions: state.chatSessions.map((session) =>
            session.id === sessionId ? { ...session, ...changes } : session,
          ),
        })),
      deleteChatSession: (sessionId) =>
        set((state) => ({
          chats: state.chats.filter((message) => message.conversationId !== sessionId),
          chatSessions: state.chatSessions.filter((session) => session.id !== sessionId),
        })),
      addChatMessage: (message) =>
        set((state) => ({
          chats: [...state.chats, message],
          chatSessions: state.chatSessions.map((session) =>
            session.id === message.conversationId
              ? { ...session, updatedAt: Math.max(session.updatedAt, message.createdAt) }
              : session,
          ),
        })),
      clearBookChats: (bookId) =>
        set((state) => ({
          chats: state.chats.filter((message) => message.bookId !== bookId),
          chatSessions: state.chatSessions.filter((session) => session.bookId !== bookId),
        })),
      upsertReadingSession: (session) =>
        set((state) => {
          const exists = state.readingSessions.some((item) => item.id === session.id);
          return {
            readingSessions: exists
              ? state.readingSessions.map((item) => item.id === session.id ? session : item)
              : [session, ...state.readingSessions],
          };
        }),
      addRssFolder: (folder) =>
        set((state) => ({
          rssFolders: [folder, ...state.rssFolders.filter((item) => item.id !== folder.id)],
        })),
      updateRssFolder: (folderId, changes) =>
        set((state) => ({
          rssFolders: state.rssFolders.map((folder) => (
            folder.id === folderId ? { ...folder, ...changes, updatedAt: Date.now() } : folder
          )),
        })),
      moveRssFolder: (folderId, beforeFolderId) =>
        set((state) => {
          if (folderId === beforeFolderId) return state;
          const folder = state.rssFolders.find((item) => item.id === folderId);
          if (!folder) return state;
          const remaining = state.rssFolders.filter((item) => item.id !== folderId);
          const targetIndex = beforeFolderId
            ? remaining.findIndex((item) => item.id === beforeFolderId)
            : remaining.length;
          if (targetIndex < 0) return state;
          remaining.splice(targetIndex, 0, folder);
          return { rssFolders: remaining };
        }),
      deleteRssFolder: (folderId) =>
        set((state) => ({
          rssFolders: state.rssFolders.filter((folder) => folder.id !== folderId),
          rssFeeds: state.rssFeeds.map((feed) => {
            if (feed.folderId !== folderId) return feed;
            const { folderId: _folderId, ...withoutFolder } = feed;
            return { ...withoutFolder, updatedAt: Date.now() };
          }),
        })),
      upsertRssFeed: (feed) =>
        set((state) => ({
          rssFeeds: [feed, ...state.rssFeeds.filter((item) => item.id !== feed.id)],
        })),
      updateRssFeed: (feedId, changes) =>
        set((state) => ({
          rssFeeds: state.rssFeeds.map((feed) => (
            feed.id === feedId ? { ...feed, ...changes, updatedAt: changes.updatedAt ?? Date.now() } : feed
          )),
        })),
      moveRssFeed: (feedId, folderId, beforeFeedId) =>
        set((state) => {
          if (feedId === beforeFeedId) return state;
          const feed = state.rssFeeds.find((item) => item.id === feedId);
          if (!feed) return state;
          const movedFeed = { ...feed, folderId, updatedAt: Date.now() };
          const remaining = state.rssFeeds.filter((item) => item.id !== feedId);
          let targetIndex = beforeFeedId
            ? remaining.findIndex((item) => item.id === beforeFeedId)
            : -1;
          if (targetIndex < 0) {
            const folderKey = folderId ?? '';
            let lastFolderFeedIndex = -1;
            remaining.forEach((item, index) => {
              if ((item.folderId ?? '') === folderKey) lastFolderFeedIndex = index;
            });
            targetIndex = lastFolderFeedIndex >= 0 ? lastFolderFeedIndex + 1 : remaining.length;
          }
          remaining.splice(targetIndex, 0, movedFeed);
          return { rssFeeds: remaining };
        }),
      deleteRssFeed: (feedId) =>
        set((state) => {
          const removedRssItemIds = new Set(
            state.rssItems.filter((item) => item.feedId === feedId).map((item) => item.id),
          );
          const removedItemIds = new Set(
            Array.from(removedRssItemIds, (itemId) => `rss:${itemId}`),
          );
          return {
            rssFeeds: state.rssFeeds.filter((feed) => feed.id !== feedId),
            rssItems: state.rssItems.filter((item) => item.feedId !== feedId),
            rssAnnotations: state.rssAnnotations.filter((annotation) => !removedRssItemIds.has(annotation.itemId)),
            rssDailyDigests: state.rssDailyDigests.map((digest) => {
              const sourceItemIds = digest.sourceItemIds.filter((itemId) => !removedRssItemIds.has(itemId));
              return {
                ...digest,
                sourceItemIds,
                sourceFeedIds: digest.sourceFeedIds.filter((itemId) => itemId !== feedId),
                itemCount: sourceItemIds.length,
              };
            }),
            chats: state.chats.filter((message) => !removedItemIds.has(message.bookId)),
            chatSessions: state.chatSessions.filter((session) => !removedItemIds.has(session.bookId)),
          };
        }),
      mergeRssItems: (feedId, items) =>
        set((state) => {
          const existing = new Map(
            state.rssItems.filter((item) => item.feedId === feedId).map((item) => [item.id, item]),
          );
          const merged = items.map((item) => {
            const previous = existing.get(item.id);
            if (!previous) return item;
            const hasNewFullContent = Number(item.fullContentFetchedAt || 0) > Number(previous.fullContentFetchedAt || 0);
            return {
              ...item,
              ...(previous.readAt ? { readAt: previous.readAt } : {}),
              ...(previous.bookmarkedAt ? { bookmarkedAt: previous.bookmarkedAt } : {}),
              ...(!hasNewFullContent && previous.aiSummary ? {
                aiSummary: previous.aiSummary,
                aiSummaryUpdatedAt: previous.aiSummaryUpdatedAt,
                aiSummaryVersion: previous.aiSummaryVersion,
              } : {}),
              ...(!hasNewFullContent && (previous.aiTranslationHtml || previous.aiTranslation) ? {
                aiTranslation: previous.aiTranslation,
                aiTranslationHtml: previous.aiTranslationHtml,
                aiTranslationUpdatedAt: previous.aiTranslationUpdatedAt,
                aiTranslationSourceFetchedAt: previous.aiTranslationSourceFetchedAt,
              } : {}),
              ...(Number(previous.fullContentFetchedAt || 0) > Number(item.fullContentFetchedAt || 0) ? {
                fullContentHtml: previous.fullContentHtml,
                fullContentText: previous.fullContentText,
                fullContentUrl: previous.fullContentUrl,
                fullContentFetchedAt: previous.fullContentFetchedAt,
                fullContentError: previous.fullContentError,
              } : {}),
            };
          });
          const mergedIds = new Set(merged.map((item) => item.id));
          const feedItems = [
            ...merged,
            ...Array.from(existing.values()).filter((item) => !mergedIds.has(item.id)),
          ].sort((left, right) => right.publishedAt - left.publishedAt);
          return {
            rssItems: [
              ...state.rssItems.filter((item) => item.feedId !== feedId),
              ...feedItems,
            ],
          };
        }),
      updateRssItem: (itemId, changes) =>
        set((state) => ({
          rssItems: state.rssItems.map((item) => item.id === itemId ? { ...item, ...changes } : item),
        })),
      addRssAnnotation: (annotation) =>
        set((state) => ({
          rssAnnotations: [annotation, ...state.rssAnnotations.filter((item) => item.id !== annotation.id)],
        })),
      updateRssAnnotation: (annotationId, changes) =>
        set((state) => ({
          rssAnnotations: state.rssAnnotations.map((annotation) => (
            annotation.id === annotationId ? { ...annotation, ...changes } : annotation
          )),
        })),
      deleteRssAnnotation: (annotationId) =>
        set((state) => ({
          rssAnnotations: state.rssAnnotations.filter((annotation) => annotation.id !== annotationId),
        })),
      upsertRssDailyDigest: (digest) =>
        set((state) => ({
          rssDailyDigests: [digest, ...state.rssDailyDigests.filter((item) => item.id !== digest.id)]
            .sort((left, right) => right.date.localeCompare(left.date)),
        })),
      setRssDigestSettings: (changes) =>
        set((state) => ({
          rssDigestSettings: { ...state.rssDigestSettings, ...changes },
        })),
      markRssItemsRead: (itemIds) =>
        set((state) => {
          const selectedIds = itemIds ? new Set(itemIds) : null;
          const readAt = Date.now();
          return {
            rssItems: state.rssItems.map((item) => (
              !item.readAt && (!selectedIds || selectedIds.has(item.id)) ? { ...item, readAt } : item
            )),
          };
        }),
      markRssItemsUnread: (itemIds) =>
        set((state) => {
          const selectedIds = itemIds ? new Set(itemIds) : null;
          return {
            rssItems: state.rssItems.map((item) => {
              if (!item.readAt || (selectedIds && !selectedIds.has(item.id))) return item;
              const { readAt: _readAt, ...unreadItem } = item;
              return unreadItem;
            }),
          };
        }),
      setRssPanelWidth: (width) => set({ rssPanelWidth: Math.min(720, Math.max(280, width)) }),
      upsertVideoResource: (video) =>
        set((state) => ({
          videoResources: [video, ...state.videoResources.filter((item) => item.id !== video.id)],
        })),
      updateVideoResource: (videoId, changes) =>
        set((state) => ({
          videoResources: state.videoResources.map((video) => (
            video.id === videoId
              ? { ...video, ...changes, updatedAt: changes.updatedAt ?? Date.now() }
              : video
          )),
        })),
      deleteVideoResource: (videoId) =>
        set((state) => {
          const resourceId = `video:${videoId}`;
          return {
            videoResources: state.videoResources.filter((video) => video.id !== videoId),
            videoTimestampNotes: state.videoTimestampNotes.filter((note) => note.videoId !== videoId),
            notes: state.notes.filter((note) => note.bookId !== resourceId),
            chats: state.chats.filter((message) => message.bookId !== resourceId),
            chatSessions: state.chatSessions.filter((session) => session.bookId !== resourceId),
          };
        }),
      addVideoTimestampNote: (note) =>
        set((state) => ({
          videoTimestampNotes: [note, ...state.videoTimestampNotes.filter((item) => item.id !== note.id)],
        })),
      updateVideoTimestampNote: (noteId, changes) =>
        set((state) => ({
          videoTimestampNotes: state.videoTimestampNotes.map((note) => (
            note.id === noteId ? { ...note, ...changes, updatedAt: Date.now() } : note
          )),
        })),
      deleteVideoTimestampNote: (noteId) =>
        set((state) => ({
          videoTimestampNotes: state.videoTimestampNotes.filter((note) => note.id !== noteId),
        })),
      setVideoPanelWidth: (width) => set({ videoPanelWidth: Math.min(720, Math.max(280, width)) }),
      addOpenAIConfig: (config) =>
        set((state) => ({
          openAIConfigs: [config, ...state.openAIConfigs.filter((item) => item.id !== config.id)],
        })),
      updateOpenAIConfig: (configId, changes) =>
        set((state) => ({
          openAIConfigs: state.openAIConfigs.map((config) =>
            config.id === configId ? { ...config, ...changes, updatedAt: Date.now() } : config,
          ),
        })),
      deleteOpenAIConfig: (configId) =>
        set((state) => {
          const provider = `api:${configId}` as const;
          return {
            openAIConfigs: state.openAIConfigs.filter((config) => config.id !== configId),
            aiPreferences: state.aiPreferences.provider === provider
              ? { ...state.aiPreferences, provider: null, model: '' }
              : state.aiPreferences,
          };
        }),
      setWebSearchConfig: (changes) =>
        set((state) => ({ webSearchConfig: { ...state.webSearchConfig, ...changes } })),
      setAiPreferences: (changes) =>
        set((state) => ({ aiPreferences: { ...state.aiPreferences, ...changes } })),
      setNavCollapsed: (navCollapsed) => set({ navCollapsed }),
      setThemeMode: (themeMode) => set({ themeMode }),
      setReaderPreferences: (changes) =>
        set((state) => ({
          readerPreferences: { ...state.readerPreferences, ...changes },
        })),
    }),
    {
      name: 'learning-center-state-v1',
      version: 25,
      storage: createJSONStorage(() => serverStateStorage),
      skipHydration: true,
      migrate: (persistedState, version) => {
        const persisted = persistedState as Partial<LearningState> & {
          chats?: Array<Omit<ChatMessage, 'conversationId'> & { conversationId?: string }>;
        };
        let migrated: Partial<LearningState> = persisted;
        if (version < 2) {
          const legacyChats = persisted.chats ?? [];
          const conversationByBook = new Map<string, string>();
          legacyChats.forEach((message) => {
            if (!conversationByBook.has(message.bookId)) {
              conversationByBook.set(message.bookId, `legacy:${message.bookId}`);
            }
          });
          const migratedChats: ChatMessage[] = legacyChats.map((message) => ({
            ...message,
            conversationId: message.conversationId ?? conversationByBook.get(message.bookId)!,
          }));
          const chatSessions: ChatSession[] = Array.from(conversationByBook, ([bookId, id]) => {
            const messages = migratedChats.filter((message) => message.bookId === bookId);
            const firstQuestion = messages.find((message) => message.role === 'user')?.content.trim().replace(/\s+/g, ' ');
            const createdAt = Math.min(...messages.map((message) => message.createdAt));
            const updatedAt = Math.max(...messages.map((message) => message.createdAt));
            return {
              id,
              bookId,
              title: firstQuestion?.slice(0, 32) || '旧对话',
              createdAt,
              updatedAt,
            };
          });
          migrated = { ...migrated, chats: migratedChats, chatSessions };
        }
        if (version < 3) {
          migrated = {
            ...migrated,
            readingSessions: [],
            openAIConfigs: [],
            aiPreferences: defaultAiPreferences,
          };
        }
        if (version < 4) {
          const legacySessions = (migrated.chatSessions ?? []) as Array<Omit<ChatSession, 'provider'> & { provider?: string }>;
          const legacyPreferences = migrated.aiPreferences as (Omit<AiPreferences, 'provider'> & { provider?: string }) | undefined;
          migrated = {
            ...migrated,
            chatSessions: legacySessions.map((session) => {
              const { provider, ...sessionWithoutProvider } = session;
              return {
                ...sessionWithoutProvider,
                ...(provider?.startsWith('api:') ? { provider: provider as ChatSession['provider'] } : {}),
              };
            }),
            aiPreferences: {
              ...defaultAiPreferences,
              ...legacyPreferences,
              provider: legacyPreferences?.provider?.startsWith('api:')
                ? legacyPreferences.provider as AiPreferences['provider']
                : null,
            },
          };
        }
        if (version < 5) {
          migrated = {
            ...migrated,
            readerPreferences: {
              ...defaultReaderPreferences,
              ...migrated.readerPreferences,
              fontFamily: normalizeReaderFont(migrated.readerPreferences?.fontFamily),
            },
          };
        }
        if (version < 6) {
          migrated = {
            ...migrated,
            webSearchConfig: defaultWebSearchConfig,
          };
        }
        if (version < 7) {
          const legacyPreferences = migrated.readerPreferences;
          migrated = {
            ...migrated,
            readerPreferences: {
              ...defaultReaderPreferences,
              ...legacyPreferences,
              theme: 'custom',
              customStyle: normalizeStoredCustomStyle({
                fontFamily: normalizeReaderFont(legacyPreferences?.fontFamily),
                paperColor: legacyReaderPaperColor(legacyPreferences?.theme),
                fontSize: legacyPreferences?.fontSize,
                density: readerDensityFromLineHeight(legacyPreferences?.lineHeight),
              }),
            },
          };
        }
        if (version < 8) {
          const legacyNotes = (migrated.notes ?? []) as Array<Omit<NoteItem, 'title'> & { title?: string }>;
          migrated = {
            ...migrated,
            notes: legacyNotes.map((note) => ({
              ...note,
              title: note.title?.trim() || markdownNoteTitle(note.content),
            })),
          };
        }
        if (version < 9) {
          const legacyHighlights = (migrated.highlights ?? []) as Array<HighlightItem & {
            comment?: unknown;
            commentUpdatedAt?: unknown;
          }>;
          migrated = {
            ...migrated,
            highlights: legacyHighlights.map((highlight) => {
              const comment = typeof highlight.comment === 'string' ? highlight.comment.trim() : '';
              if (!comment) {
                const { comment: _comment, commentUpdatedAt: _commentUpdatedAt, ...withoutComment } = highlight;
                return withoutComment;
              }
              return {
                ...highlight,
                comment,
                commentUpdatedAt: typeof highlight.commentUpdatedAt === 'number'
                  ? highlight.commentUpdatedAt
                  : highlight.createdAt,
              };
            }),
          };
        }
        if (version < 10) {
          migrated = {
            ...migrated,
            highlights: (migrated.highlights ?? []).map((highlight) => ({
              ...highlight,
              kind: highlight.kind === 'comment' ? 'comment' : 'highlight',
            })),
          };
        }
        if (version < 11) {
          migrated = {
            ...migrated,
            readerPreferences: {
              ...defaultReaderPreferences,
              ...migrated.readerPreferences,
              customStyle: normalizeStoredCustomStyle(migrated.readerPreferences?.customStyle),
            },
          };
        }
        if (version < 12) {
          migrated = {
            ...migrated,
            readerPreferences: {
              ...defaultReaderPreferences,
              ...migrated.readerPreferences,
              customStyle: normalizeStoredCustomStyle(migrated.readerPreferences?.customStyle),
            },
          };
        }
        if (version < 13) {
          migrated = {
            ...migrated,
            rssFolders: [],
            rssFeeds: [],
            rssItems: [],
          };
        }
        if (version < 14) {
          migrated = {
            ...migrated,
            rssPanelWidth: 380,
          };
        }
        if (version < 15) {
          migrated = {
            ...migrated,
            rssItems: (migrated.rssItems ?? []).map((item) => ({
              ...item,
              ...(item.aiSummary && !item.aiSummaryVersion ? { aiSummaryVersion: 1 } : {}),
            })),
          };
        }
        if (version < 16) {
          migrated = {
            ...migrated,
            rssAnnotations: [],
          };
        }
        if (version < 17) {
          migrated = {
            ...migrated,
            rssFeeds: (migrated.rssFeeds ?? []).map((feed) => ({
              ...feed,
              fetchFullContent: Boolean(feed.fetchFullContent),
            })),
          };
        }
        if (version < 18) {
          migrated = {
            ...migrated,
            videoResources: [],
            videoTimestampNotes: [],
            videoPanelWidth: 400,
          };
        }
        if (version < 19) {
          migrated = {
            ...migrated,
            rssDailyDigests: [],
            rssDigestSettings: defaultRssDigestSettings,
          };
        }
        if (version < 20) {
          migrated = {
            ...migrated,
            rssDigestRuns: [],
          };
        }
        if (version < 21) {
          const digestSettings = migrated.rssDigestSettings;
          migrated = {
            ...migrated,
            rssDigestSettings: {
              ...defaultRssDigestSettings,
              ...digestSettings,
              prompt: !digestSettings?.prompt || digestSettings.prompt === LEGACY_RSS_DIGEST_PROMPT
                ? DEFAULT_RSS_DIGEST_PROMPT
                : digestSettings.prompt,
            },
          };
        }
        if (version < 23) {
          migrated = {
            ...migrated,
            rssItems: (migrated.rssItems ?? []).map((item) => ({
              ...item,
              ...(typeof item.aiTranslationHtml === 'string' && item.aiTranslationHtml.trim()
                ? { aiTranslationHtml: item.aiTranslationHtml }
                : { aiTranslationHtml: undefined }),
            })),
            rssFeeds: (migrated.rssFeeds ?? []).map((feed) => normalizeRssFeedSource(feed)),
          };
        }
        if (version < 24) {
          migrated = {
            ...migrated,
            bookLists: [],
          };
        }
        if (version < 25) {
          migrated = {
            ...migrated,
            trashedBooks: [],
            deletedBookTombstones: [],
          };
        }
        return migrated;
      },
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<LearningState>;
        return {
          ...currentState,
          ...persisted,
          bookLists: Array.isArray(persisted.bookLists) ? persisted.bookLists : [],
          trashedBooks: Array.isArray(persisted.trashedBooks) ? persisted.trashedBooks : [],
          deletedBookTombstones: Array.isArray(persisted.deletedBookTombstones)
            ? persisted.deletedBookTombstones
            : [],
          rssFolders: Array.isArray(persisted.rssFolders) ? persisted.rssFolders : [],
          rssFeeds: Array.isArray(persisted.rssFeeds)
            ? persisted.rssFeeds.map((feed) => normalizeRssFeedSource(feed))
            : [],
          rssItems: Array.isArray(persisted.rssItems) ? persisted.rssItems : [],
          rssAnnotations: Array.isArray(persisted.rssAnnotations) ? persisted.rssAnnotations : [],
          rssDailyDigests: Array.isArray(persisted.rssDailyDigests) ? persisted.rssDailyDigests : [],
          rssDigestRuns: Array.isArray(persisted.rssDigestRuns) ? persisted.rssDigestRuns : [],
          rssDigestSettings: {
            ...defaultRssDigestSettings,
            ...persisted.rssDigestSettings,
            times: Array.isArray(persisted.rssDigestSettings?.times)
              ? persisted.rssDigestSettings.times
              : defaultRssDigestSettings.times,
          },
          rssPanelWidth: typeof persisted.rssPanelWidth === 'number' ? persisted.rssPanelWidth : 380,
          videoResources: Array.isArray(persisted.videoResources) ? persisted.videoResources : [],
          videoTimestampNotes: Array.isArray(persisted.videoTimestampNotes) ? persisted.videoTimestampNotes : [],
          videoPanelWidth: typeof persisted.videoPanelWidth === 'number' ? persisted.videoPanelWidth : 400,
          readerPreferences: {
            ...defaultReaderPreferences,
            ...persisted.readerPreferences,
            theme: normalizeReaderTheme(persisted.readerPreferences?.theme),
            fontFamily: normalizeReaderFont(persisted.readerPreferences?.fontFamily),
            customStyle: normalizeStoredCustomStyle(persisted.readerPreferences?.customStyle),
          },
          aiPreferences: {
            provider: persisted.aiPreferences?.provider?.startsWith('api:')
              ? persisted.aiPreferences.provider
              : null,
            model: persisted.aiPreferences?.model ?? '',
          },
          webSearchConfig: {
            ...defaultWebSearchConfig,
            ...persisted.webSearchConfig,
          },
        };
      },
    },
  ),
);
