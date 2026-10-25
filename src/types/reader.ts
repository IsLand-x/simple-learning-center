export type RightPanel =
  | 'ai'
  | 'history'
  | 'resources'
  | 'mindmap'
  | 'chapter-video'
  | 'notes'
  | 'glossary'
  | 'highlights'
  | 'comments'
  | 'trajectory'
  | null;

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
