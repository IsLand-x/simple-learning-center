export type ThemeMode = 'light' | 'dark';
export type ReaderTheme =
  | 'paper'
  | 'ivory'
  | 'mist'
  | 'celadon'
  | 'twilight'
  | 'rice'
  | 'azure'
  | 'ink'
  | 'custom';
export type ReaderFont =
  | 'system-serif'
  | 'source-serif'
  | 'sans'
  | 'kai'
  | 'bright'
  | 'pingfang';
export type ReaderDensity = 'compact' | 'balanced' | 'relaxed';
export type ReaderTexture = 'none' | 'paper' | 'grain';
export type AiProvider = `api:${string}`;
export type RightPanel = 'ai' | 'history' | 'notes' | 'highlights' | 'comments' | 'trajectory' | null;

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
  kind?: 'highlight' | 'comment';
  text: string;
  cfi: string;
  chapter: string;
  page?: number;
  comment?: string;
  commentUpdatedAt?: number;
  createdAt: number;
}

export interface NoteItem {
  id: string;
  bookId: string;
  title: string;
  content: string;
  fileName?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ChatMessage {
  id: string;
  bookId: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  dialogueContent?: AiDialogueContentItem[];
  quote?: {
    text: string;
    chapter: string;
  };
  createdAt: number;
}

export interface AiDialogueContentItem {
  type?: string;
  status?: string;
  [key: string]: unknown;
}

export interface ChatSession {
  id: string;
  bookId: string;
  title: string;
  provider?: AiProvider;
  model?: string;
  createdAt: number;
  updatedAt: number;
}

export interface OpenAICompatibleConfig {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  models: string[];
  createdAt: number;
  updatedAt: number;
}

export interface WebSearchConfig {
  provider: 'jina';
  apiKey: string;
}

export interface AiPreferences {
  provider: AiProvider | null;
  model: string;
}

export interface ReadingSession {
  id: string;
  bookId: string;
  startedAt: number;
  endedAt: number;
  durationMs: number;
}

export interface ReaderPreferences {
  fontSize: number;
  lineHeight: number;
  theme: ReaderTheme;
  fontFamily: ReaderFont;
  customStyle: ReaderCustomStyle;
  tocWidth: number;
  panelWidth: number;
  tocCollapsed: boolean;
}

export interface ReaderCustomStyle {
  fontFamily: ReaderFont;
  paperColor: string;
  textColor: string;
  texture: ReaderTexture;
  fontSize: number;
  density: ReaderDensity;
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

export interface ReaderHighlightTarget {
  highlightId: string;
  rect: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
}
