import type { BookItem } from '../../../../contracts/books.js';

function archiveVersion(book: BookItem | undefined) {
  const value = book?.archiveUpdatedAt ?? book?.archivedAt;
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

// Reading progress and archive changes have independent versions. A stale or
// pre-archive browser may save newer progress without changing the shelf status.
export function mergeBookArchive(selected: BookItem, incoming: BookItem, current?: BookItem) {
  const source = archiveVersion(incoming) > archiveVersion(current) ? incoming : current;
  if (!source || !archiveVersion(source)) return selected;
  const { archivedAt: _archivedAt, archiveUpdatedAt: _archiveUpdatedAt, ...rest } = selected;
  return {
    ...rest,
    archiveUpdatedAt: archiveVersion(source),
    ...(source.archivedAt ? { archivedAt: source.archivedAt } : {}),
  };
}
