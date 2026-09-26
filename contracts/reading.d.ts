export type ReaderTheme =
  | 'paper'
  | 'ivory'
  | 'mist'
  | 'celadon'
  | 'twilight'
  | 'rice'
  | 'azure'
  | 'ink'
  | 'parchment'
  | 'blossom'
  | 'lavender'
  | 'forest'
  | 'graphite'
  | 'oled'
  | 'custom';

export type ReaderFont = 'system-serif' | 'source-serif' | 'sans' | 'kai' | 'bright' | 'pingfang';

export type ReaderDensity = 'compact' | 'balanced' | 'relaxed';

export type ReaderTexture = 'none' | 'paper' | 'grain' | 'linen';

export interface DeletedHighlightTombstone {
  highlightId: string;
  bookId: string;
  deletedAt: number;
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
  updatedAt: number;
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
