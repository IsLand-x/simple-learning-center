import type {
  BookItem,
  HighlightItem,
  ReaderHighlightTarget,
  ReaderPreferences,
  ReaderSelection,
  ThemeMode,
} from '../../../../../util/types';

export interface ReaderLocationUpdate {
  cfi?: string;
  href?: string;
  progress?: number;
  page?: number;
  totalPages?: number;
}

export interface ReaderSurfaceHandle {
  next: () => void;
  prev: () => void;
  display: (target: string, label?: string) => void;
  clearSelection: () => void;
  getCurrentText: () => string;
}

export interface ReaderSurfaceProps {
  book: BookItem;
  compactLayout: boolean;
  preferences: ReaderPreferences;
  highlights: HighlightItem[];
  themeMode: ThemeMode;
  onLocationChange: (location: ReaderLocationUpdate) => void;
  onSelection: (selection: ReaderSelection | null) => void;
  onHighlightClick: (target: ReaderHighlightTarget) => void;
  onContentInteraction: () => void;
  onCenterTap: () => void;
}
