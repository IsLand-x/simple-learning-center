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
function samePlace(current: ReportedReaderLocation, next: ReportedReaderLocation) {
  // CFI strings change when the renderer normalizes or reflows the same page.
  // A navigation is a new chapter or a progress change.
  return (
    Math.abs(current.progress - next.progress) < 0.1 &&
    current.currentChapter === next.currentChapter
  );
}

// Foliate reports `page`, `snap`, and `scroll` for a user page turn. Opening a
// saved CFI and reflowing after resize, columns, or font use `anchor`,
// `navigation`, or `selection`. A directory or reference jump sets
// pendingUserNavigation so that one `navigation` sample is still saved.
export function isUserDrivenLocation(reason: string | undefined, pendingUserNavigation: boolean) {
  if (reason === 'page' || reason === 'snap' || reason === 'scroll') return true;
  if ((reason === 'navigation' || reason === 'anchor') && pendingUserNavigation) return true;
  return false;
}

export function isSameDemoAnchor(currentCfi: string | undefined, nextCfi: string | undefined) {
  const parse = (cfi: string | undefined) => {
    const match = cfi?.match(/^demo:(.+):scroll:(-?\d+(?:\.\d+)?)$/);
    if (!match) return null;
    return { href: match[1], ratio: Number(match[2]) };
  };
  const current = parse(currentCfi);
  const next = parse(nextCfi);
  return (
    current !== null &&
    next !== null &&
    current.href === next.href &&
    Math.abs(current.ratio - next.ratio) < 1e-6
  );
}

export function isSameReaderPlace(current: ReportedReaderLocation, next: ReportedReaderLocation) {
  return samePlace(current, next);
}

// Page and totalPages change when the renderer reflows. Only a new place is a
// navigation. The first real page turn is kept; later reflow samples are not.
export function shouldPersistReportedLocation(
  opened: ReportedReaderLocation,
  stored: ReportedReaderLocation,
  previousReport: ReportedReaderLocation | null,
  next: ReportedReaderLocation,
) {
  if (previousReport && sameReaderLocation(previousReport, next)) return false;
  const baseline = previousReport ?? opened;
  if (samePlace(baseline, next)) return false;
  return !samePlace(stored, next);
}
