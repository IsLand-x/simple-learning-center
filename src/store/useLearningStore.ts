import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { demoBooks } from '../data/demo';
import type {
  BookItem,
  ChatMessage,
  HighlightItem,
  NoteItem,
  ReaderPreferences,
  ThemeMode,
} from '../types';

const defaultReaderPreferences: ReaderPreferences = {
  fontSize: 18,
  lineHeight: 1.8,
  theme: 'paper',
  tocWidth: 272,
  panelWidth: 380,
};

interface LearningState {
  books: BookItem[];
  highlights: HighlightItem[];
  notes: NoteItem[];
  chats: ChatMessage[];
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
  addChatMessage: (message: ChatMessage) => void;
  clearBookChats: (bookId: string) => void;
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
      addChatMessage: (message) => set((state) => ({ chats: [...state.chats, message] })),
      clearBookChats: (bookId) =>
        set((state) => ({ chats: state.chats.filter((message) => message.bookId !== bookId) })),
      setNavCollapsed: (navCollapsed) => set({ navCollapsed }),
      setThemeMode: (themeMode) => set({ themeMode }),
      setReaderPreferences: (changes) =>
        set((state) => ({
          readerPreferences: { ...state.readerPreferences, ...changes },
        })),
    }),
    {
      name: 'learning-center-state-v1',
      version: 1,
    },
  ),
);
