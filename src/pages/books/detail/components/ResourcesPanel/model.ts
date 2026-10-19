import type { BookImageResource } from '../../../../../api/books/type';

const imageIdPattern = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const localImageId = new RegExp(`^${imageIdPattern}$`);
// COS uploads retain the local UUID in the object name. The save endpoint still
// verifies that this image exists in the current book; no remote image is fetched.
const hostedImageId = new RegExp(
  `^https://[a-z0-9][a-z0-9-]{1,49}-[0-9]+\\.cos\\.[a-z]+(?:-[a-z0-9]+)+\\.myqcloud\\.com/[a-z0-9][a-z0-9/_-]*/\\d{4}-\\d{2}-\\d{2}/(${imageIdPattern})\\.png$`,
);

export function bookResourceImageId(src: string | undefined, bookId: string) {
  if (!src) return null;
  const prefix = `/api/books/${encodeURIComponent(bookId)}/knowledge-maps/`;
  if (src.startsWith(prefix)) {
    const id = src.slice(prefix.length);
    return localImageId.test(id) ? id : null;
  }
  return src.match(hostedImageId)?.[1] ?? null;
}

export type ResourceSortOrder = 'newest' | 'oldest';

export function sortBookResources(resources: BookImageResource[], order: ResourceSortOrder) {
  return [...resources].sort((a, b) =>
    order === 'oldest' ? a.savedAt - b.savedAt : b.savedAt - a.savedAt,
  );
}
