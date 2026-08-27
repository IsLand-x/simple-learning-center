export type ThemeMode = 'light' | 'dark';
export type ReaderTheme = 'paper' | 'white' | 'night';
export type ReaderFont = 'system-serif' | 'source-serif' | 'sans' | 'kai';
export type AcpProvider = 'codex' | 'kimi';
export type RightPanel = 'ai' | 'notes' | 'highlights' | null;

export interface TocItem {
  id: string;
  href: string;
  label: string;
  subitems?: TocItem[];
}

export interface BookItem {
  id: string;
  kind: 'demo' | 'epub';
  title: string;
  author: string;
  fileName: string;
  fileSize: number;
  coverDataUrl?: string;
  createdAt: number;
  updatedAt: number;
  progress: number;
  currentCfi?: string;
  currentChapter: string;
  currentPage?: number;
  totalPages?: number;
  toc: TocItem[];
}

export interface HighlightItem {
  id: string;
  bookId: string;
  text: string;
  cfi: string;
  chapter: string;
  page?: number;
  createdAt: number;
}

export interface NoteItem {
  id: string;
  bookId: string;
  content: string;
  createdAt: number;
  updatedAt: number;
}

export interface ChatMessage {
  id: string;
  bookId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
}

export interface ReaderPreferences {
  fontSize: number;
  lineHeight: number;
  theme: ReaderTheme;
  fontFamily: ReaderFont;
  tocWidth: number;
  panelWidth: number;
  tocCollapsed: boolean;
}

export interface ReaderSelection {
  text: string;
  cfi: string;
  rect: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
}
