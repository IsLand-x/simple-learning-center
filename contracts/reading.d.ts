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
  | 'snow'
  | 'oat'
  | 'sage'
  | 'taupe'
  | 'slate'
  | 'plum'
  | 'custom';

export interface ChapterVideoJob {
  id: string;
  bookId: string;
  chapterId?: string;
  chapterTitle: string;
  model: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  revision: number;
  content: string;
  error?: string;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
}

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
  kind?: 'highlight' | 'comment' | 'term';
  definition?: string;
  text: string;
  cfi: string;
  chapter: string;
  page?: number;
  comment?: string;
  commentUpdatedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface DeletedNoteTombstone {
  noteId: string;
  bookId: string;
  deletedAt: number;
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
  /** Missing only in pre-v41 snapshots, where typography was part of the color preset. */
  paragraphStyle?: 'book' | 'spaced';
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

export interface MindMapSource {
  passageId: string;
  chapter: string;
  href: string;
  cfi?: string;
  quote: string;
}

export interface MindMapNode {
  id: string;
  parentId: string | null;
  title: string;
  sources: MindMapSource[];
}

export interface ChapterMindMap {
  id: string;
  version: 1;
  revision: number;
  bookId: string;
  chapterId: string;
  chapterTitle: string;
  nodes: MindMapNode[];
  model: string;
  generatedAt: number;
  updatedAt: number;
}

export type ChapterVideoNarration =
  | { source: 'settings' }
  | {
      configId: string;
      model: string;
      voice: string;
    };

export interface ChapterVideoScene {
  topicIds?: string[];
  beats?: ChapterVideoBeat[];
  visual?: {
    kind: 'trade' | 'balance' | 'flow' | 'comparison' | 'ledger';
    mode?: 'closed' | 'export' | 'import' | 'tariff' | 'quota';
    example?: 'linear-trade';
    connections?: Array<{ from: number; to: number; label: string }>;
    comparison?: {
      left: string;
      right: string;
      rows: Array<{ label: string; left: string; right: string }>;
    };
  };
  title: string;
  narration: string;
  layout: 'concept' | 'steps' | 'compare' | 'summary';
  points: Array<{ title: string; detail: string }>;
  sources: MindMapSource[];
  startSeconds: number;
  durationSeconds: number;
}

export interface ChapterVideoBeat {
  text: string;
  focus: 'setup' | 'price' | 'quantities' | 'welfare' | 'revenue' | 'loss' | 'point' | 'conclusion';
  pointIndex?: number;
  /** Local to this scene; populated from measured audio, never supplied by the model. */
  startSeconds: number;
  durationSeconds: number;
}

export interface ChapterVideo {
  id: string;
  version: 1;
  bookId: string;
  /** Absent for a whole-book introduction. */
  chapterId?: string;
  chapterTitle: string;
  title: string;
  summary: string;
  coverage?: Array<{ title: string; sceneIndexes: number[] }>;
  scenes: ChapterVideoScene[];
  durationSeconds: number;
  hasAudio: boolean;
  model: string;
  generatedAt: number;
  cosUrl?: string;
  posterCosUrl?: string;
}
