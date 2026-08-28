export type ThemeMode = 'light' | 'dark';
export type ReaderTheme = 'paper' | 'white' | 'night';
export type ReaderFont =
  | 'system-serif'
  | 'source-serif'
  | 'sans'
  | 'kai'
  | 'pingfang'
  | 'mi-lanting'
  | 'yahei'
  | 'fangsong'
  | 'wenkai-screen';
export type AiProvider = `api:${string}`;
export type AiContextTool = 'book' | 'chapter' | 'notes' | 'highlights' | 'reading-history';
export type RightPanel = 'ai' | 'history' | 'notes' | 'highlights' | 'trajectory' | null;

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
