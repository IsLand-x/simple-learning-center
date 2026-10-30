import type { LearningData } from '../../contracts/state';
import type { StoreApi } from 'zustand';
import type {
  AiPreferences,
  ChatMessage,
  ChatSession,
  ChatSessionSummary,
  ConversationMessagesPage,
  OpenAICompatibleConfig,
} from '../../contracts/ai';
import type { BookItem, BookList } from '../../contracts/books';
import type {
  HighlightItem,
  NoteItem,
  ReaderPreferences,
  ReadingSession,
} from '../../contracts/reading';
import type { ThemeMode, WebSearchConfig } from '../../contracts/settings';

export interface LearningState extends LearningData {
  setConversationDraft: (resourceId: string, conversationId: string, text: string) => void;
  conversationSummaries: ChatSessionSummary[];
  loadConversationSummaries: (bookId: string) => Promise<void>;
  loadConversationMessages: (
    bookId: string,
    id: string,
    before?: string,
  ) => Promise<ConversationMessagesPage>;
  addBooks: (books: BookItem[]) => void;
  setBookCovers: (covers: Record<string, string>) => void;
  updateBook: (bookId: string, changes: Partial<BookItem>) => void;
  setBookPinned: (bookId: string, pinned: boolean, pinnedAt?: number) => void;
  setBookArchived: (bookId: string, archived: boolean, changedAt?: number) => void;
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
  updateHighlight: (
    highlightId: string,
    changes: Partial<Pick<HighlightItem, 'comment' | 'definition'>>,
  ) => void;
  deleteHighlight: (highlightId: string) => void;
  addNote: (note: NoteItem) => void;
  setBookNoteContent: (bookId: string, bookTitle: string, content: string) => void;
  updateNote: (
    noteId: string,
    changes: Partial<Pick<NoteItem, 'title' | 'content' | 'fileName'>>,
  ) => void;
  deleteNote: (noteId: string) => void;
  markChatMessagesRead: (messageIds: string[]) => Promise<void>;
  createChatSession: (session: ChatSession) => void;
  updateChatSession: (
    sessionId: string,
    changes: Partial<Pick<ChatSession, 'provider' | 'model' | 'reasoningEffort'>>,
  ) => Promise<void>;
  deleteChatSession: (sessionId: string) => Promise<void>;
  addChatMessage: (message: ChatMessage) => void;
  clearBookChats: (bookId: string) => Promise<void>;
  upsertReadingSession: (session: ReadingSession) => void;
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
