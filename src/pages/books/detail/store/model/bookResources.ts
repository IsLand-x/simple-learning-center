export interface BookImageResource {
  imageId: string;
  title: string;
  savedAt: number;
  url: string;
}

export function bookResourceImageId(src: string | undefined, bookId: string) {
  const prefix = `/api/books/${encodeURIComponent(bookId)}/knowledge-maps/`;
  if (!src?.startsWith(prefix)) return null;
  const id = src.slice(prefix.length);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id) ? id : null;
}
