import type { BookItem } from '../../../../../contracts/books';

export interface ReportedReaderLocation {
  progress: number;
  currentCfi?: string;
  currentChapter: string;
  currentPage?: number;
  totalPages?: number;
}

function sameOptional(left: number | undefined, right: number | undefined) {
  return left === right;
}

function sameReaderLocation(current: ReportedReaderLocation, next: ReportedReaderLocation) {
  return (
    Math.abs(current.progress - next.progress) < 0.1 &&
    (current.currentCfi ?? '') === (next.currentCfi ?? '') &&
    current.currentChapter === next.currentChapter &&
    sameOptional(current.currentPage, next.currentPage) &&
    sameOptional(current.totalPages, next.totalPages)
  );
}

export function reportedReaderLocation(
  book: Pick<BookItem, 'progress' | 'currentCfi' | 'currentChapter' | 'currentPage' | 'totalPages'>,
  location: {
    progress?: number;
    cfi?: string;
    chapter?: string;
    page?: number;
    totalPages?: number;
  },
): ReportedReaderLocation {
  return {
    progress:
      location.progress === undefined ? book.progress : Math.round(location.progress * 10) / 10,
    currentCfi: location.cfi ?? book.currentCfi,
    currentChapter: location.chapter ?? book.currentChapter,
    currentPage: location.page ?? book.currentPage,
    totalPages: location.totalPages ?? book.totalPages,
  };
}

export function locationFromBook(
  book: Pick<BookItem, 'progress' | 'currentCfi' | 'currentChapter' | 'currentPage' | 'totalPages'>,
): ReportedReaderLocation {
  return reportedReaderLocation(book, {});
}

// The open reader reports its current page again after a remote snapshot arrives.
// That echo must not become a newer local save, while a real page turn still does.
export function shouldPersistReportedLocation(
  opened: ReportedReaderLocation,
  openedUpdatedAt: number,
  stored: ReportedReaderLocation,
  storedUpdatedAt: number,
  previousReport: ReportedReaderLocation | null,
  next: ReportedReaderLocation,
) {
  if (previousReport && sameReaderLocation(previousReport, next)) return false;
  const remoteSupersededOpen =
    storedUpdatedAt > openedUpdatedAt && !sameReaderLocation(stored, opened);
  // The first sample after opening is the page already on screen, even when the
  // renderer normalizes its CFI. Do not turn that sample into a newer save once
  // another device has stored a later location.
  if (!previousReport && (remoteSupersededOpen || sameReaderLocation(opened, next))) return false;
  return !sameReaderLocation(stored, next);
}
