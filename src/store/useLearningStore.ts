import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { demoBooks } from '../data/demo';
import type {
  AiPreferences,
  BookItem,
  ChatMessage,
  ChatSession,
  HighlightItem,
  NoteItem,
  OpenAICompatibleConfig,
  ReaderPreferences,
  ReadingSession,
  ThemeMode,
} from '../types';

const defaultReaderPreferences: ReaderPreferences = {
  fontSize: 18,
  lineHeight: 1.8,
  theme: 'paper',
  fontFamily: 'system-serif',
  tocWidth: 272,
  panelWidth: 380,
  tocCollapsed: false,
};

const defaultAiPreferences: AiPreferences = {
  provider: null,
  model: '',
};

interface LearningState {
  books: BookItem[];
  highlights: HighlightItem[];
  notes: NoteItem[];
  chats: ChatMessage[];
  chatSessions: ChatSession[];
  readingSessions: ReadingSession[];
  openAIConfigs: OpenAICompatibleConfig[];
  aiPreferences: AiPreferences;
  navCollapsed: boolean;
  themeMode: ThemeMode;
  readerPreferences: ReaderPreferences;
  addBooks: (books: BookItem[]) => void;
  updateBook: (bookId: string, changes: Partial<BookItem>) => void;
  deleteBook: (bookId: string) => void;
  addHighlight: (highlight: HighlightItem) => void;
  deleteHighlight: (highlightId: string) => void;
  addNote: (note: NoteItem) => void;
  updateNote: (noteId: string, content: string) => void;
  deleteNote: (noteId: string) => void;
  createChatSession: (session: ChatSession) => void;
  updateChatSession: (sessionId: string, changes: Partial<ChatSession>) => void;
  deleteChatSession: (sessionId: string) => void;
  addChatMessage: (message: ChatMessage) => void;
  clearBookChats: (bookId: string) => void;
  upsertReadingSession: (session: ReadingSession) => void;
  addOpenAIConfig: (config: OpenAICompatibleConfig) => void;
  updateOpenAIConfig: (configId: string, changes: Partial<OpenAICompatibleConfig>) => void;
  deleteOpenAIConfig: (configId: string) => void;
  setAiPreferences: (changes: Partial<AiPreferences>) => void;
  setNavCollapsed: (collapsed: boolean) => void;
  setThemeMode: (theme: ThemeMode) => void;
  setReaderPreferences: (changes: Partial<ReaderPreferences>) => void;
}

export const useLearningStore = create<LearningState>()(
  persist(
    (set) => ({
      books: demoBooks,
      highlights: [],
      notes: [],
      chats: [],
      chatSessions: [],
      readingSessions: [],
      openAIConfigs: [],
      aiPreferences: defaultAiPreferences,
      navCollapsed: false,
      themeMode: 'light',
      readerPreferences: defaultReaderPreferences,
      addBooks: (books) =>
        set((state) => ({ books: [...books, ...state.books.filter((book) => !books.some((next) => next.id === book.id))] })),
      updateBook: (bookId, changes) =>
        set((state) => ({
          books: state.books.map((book) =>
            book.id === bookId ? { ...book, ...changes, updatedAt: changes.updatedAt ?? Date.now() } : book,
          ),
        })),
      deleteBook: (bookId) =>
        set((state) => ({
          books: state.books.filter((book) => book.id !== bookId),
          highlights: state.highlights.filter((highlight) => highlight.bookId !== bookId),
          notes: state.notes.filter((note) => note.bookId !== bookId),
          chats: state.chats.filter((message) => message.bookId !== bookId),
          chatSessions: state.chatSessions.filter((session) => session.bookId !== bookId),
          readingSessions: state.readingSessions.filter((session) => session.bookId !== bookId),
        })),
      addHighlight: (highlight) =>
        set((state) => ({
          highlights: [highlight, ...state.highlights.filter((item) => item.id !== highlight.id)],
        })),
      deleteHighlight: (highlightId) =>
        set((state) => ({ highlights: state.highlights.filter((item) => item.id !== highlightId) })),
      addNote: (note) => set((state) => ({ notes: [note, ...state.notes] })),
      updateNote: (noteId, content) =>
        set((state) => ({
          notes: state.notes.map((note) =>
            note.id === noteId ? { ...note, content, updatedAt: Date.now() } : note,
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
      version: 4,
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
        return migrated;
      },
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<LearningState>;
        return {
          ...currentState,
          ...persisted,
          readerPreferences: {
            ...defaultReaderPreferences,
            ...persisted.readerPreferences,
          },
          aiPreferences: {
            provider: persisted.aiPreferences?.provider?.startsWith('api:')
              ? persisted.aiPreferences.provider
              : null,
            model: persisted.aiPreferences?.model ?? '',
          },
        };
      },
    },
  ),
);
