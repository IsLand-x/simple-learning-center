export interface BookPassage {
  id: string;
  chapter: string;
  href: string;
  sectionIndex: number;
  chunkIndex: number;
  text: string;
  chapterIds?: string[];
  cfi?: string;
}

export interface BookSearchIndex {
  version: number;
  bookId: string;
  fileSize: number;
  passages: BookPassage[];
}
