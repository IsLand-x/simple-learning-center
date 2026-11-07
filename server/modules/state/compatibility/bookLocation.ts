import type { BookItem } from '../../../../contracts/books.js';

function bookUpdatedAt(book: BookItem | undefined) {
  return typeof book?.updatedAt === 'number' && Number.isFinite(book.updatedAt)
    ? book.updatedAt
    : 0;
}

function locationUpdatedAt(book: BookItem | undefined) {
  const value = book?.locationUpdatedAt;
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function mergeBookFields(incoming: BookItem, current: BookItem): BookItem {
  const meta = bookUpdatedAt(incoming) >= bookUpdatedAt(current) ? incoming : current;
  const incomingLocation = locationUpdatedAt(incoming);
  const currentLocation = locationUpdatedAt(current);
  const location =
    incomingLocation === undefined && currentLocation === undefined
      ? meta
      : incomingLocation !== undefined &&
          incomingLocation >= (currentLocation ?? Number.NEGATIVE_INFINITY)
        ? incoming
        : current;
  const merged: BookItem = { ...meta };
  if (location.progress !== undefined) merged.progress = location.progress;
  if (location.currentChapter !== undefined) merged.currentChapter = location.currentChapter;
  if (location.currentCfi === undefined) delete merged.currentCfi;
  else merged.currentCfi = location.currentCfi;
  if (location.currentPage === undefined) delete merged.currentPage;
  else merged.currentPage = location.currentPage;
  if (location.totalPages === undefined) delete merged.totalPages;
  else merged.totalPages = location.totalPages;
  const clock = locationUpdatedAt(location);
  if (clock === undefined) delete merged.locationUpdatedAt;
  else merged.locationUpdatedAt = clock;
  return merged;
}
