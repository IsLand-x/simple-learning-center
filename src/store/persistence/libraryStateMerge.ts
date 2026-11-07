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
    const selected = !current || bookUpdatedAt(book) >= bookUpdatedAt(current) ? book : current;
    merged.push(mergeBookArchive(selected, book, current));
  }
  for (const book of local ?? []) {
    if (book?.id && !seen.has(book.id)) merged.push(book);
  }
  return merged;
}
