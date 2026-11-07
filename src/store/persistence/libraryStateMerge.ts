import type { BookItem } from '../../../contracts/books';

function bookUpdatedAt(book: Pick<BookItem, 'updatedAt'> | undefined) {
  return typeof book?.updatedAt === 'number' && Number.isFinite(book.updatedAt)
    ? book.updatedAt
    : 0;
}

function archiveVersion(book: Pick<BookItem, 'archivedAt' | 'archiveUpdatedAt'> | undefined) {
  const value = book?.archiveUpdatedAt ?? book?.archivedAt;
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

function mergeBookArchive(selected: BookItem, incoming: BookItem, current?: BookItem) {
  const source = archiveVersion(incoming) > archiveVersion(current) ? incoming : current;
  if (!source || !archiveVersion(source)) return selected;
  const { archivedAt: _archivedAt, archiveUpdatedAt: _archiveUpdatedAt, ...rest } = selected;
  return {
    ...rest,
    archiveUpdatedAt: archiveVersion(source),
    ...(source.archivedAt ? { archivedAt: source.archivedAt } : {}),
  };
}

function locationClock(book: BookItem | undefined) {
  const value = book?.locationUpdatedAt;
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function mergeBookFields(incoming: BookItem, current: BookItem): BookItem {
  const meta = bookUpdatedAt(incoming) >= bookUpdatedAt(current) ? incoming : current;
  const incomingLocation = locationClock(incoming);
  const currentLocation = locationClock(current);
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
  const clock = locationClock(location);
  if (clock === undefined) delete merged.locationUpdatedAt;
  else merged.locationUpdatedAt = clock;
  return merged;
}

export function mergeLibraryBooks(remote: BookItem[] | undefined, local: BookItem[] | undefined) {
  const localById = new Map(
    (local ?? []).filter((book) => book?.id).map((book) => [book.id, book]),
  );
  const merged: BookItem[] = [];
  const seen = new Set<string>();
  for (const book of remote ?? []) {
    if (!book?.id) continue;
    seen.add(book.id);
    const current = localById.get(book.id);
    const selected = current ? mergeBookFields(book, current) : book;
    merged.push(mergeBookArchive(selected, book, current));
  }
  for (const book of local ?? []) {
    if (book?.id && !seen.has(book.id)) merged.push(book);
  }
  return merged;
}
