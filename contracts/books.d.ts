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
  pinnedAt?: number;
  progress: number;
  currentCfi?: string;
  currentChapter: string;
  currentPage?: number;
  totalPages?: number;
  toc: TocItem[];
}

export interface BookList {
  id: string;
  name: string;
  note: string;
  bookIds: string[];
  createdAt: number;
  updatedAt: number;
}

export interface TrashedBookItem {
  book: BookItem;
  deletedAt: number;
  bookListPositions: Array<{
    bookListId: string;
    index: number;
  }>;
}

export interface DeletedBookTombstone {
  bookId: string;
  deletedAt: number;
}

export type DoubanBookInfo =
  | {
      status: 'matched';
      title: string;
      url: string;
      reviewsUrl: string;
      description: string;
      rating: number | null;
      reviews: Array<{ title: string; author: string; url: string }>;
      fetchedAt: number;
    }
  | { status: 'not_found' | 'unavailable'; searchUrl: string };
