import { useEffect, useState } from 'react';
import { booksApi } from '../../../../../api/books';
import type { BookImageDimensions } from '../../../../../api/books/type';

const dimensionsCache = new Map<string, Promise<BookImageDimensions | undefined>>();

export function useBookImageDimensions(bookId: string, imageId: string | null) {
  const key = imageId ? `${bookId}/${imageId}` : '';
  const [result, setResult] = useState<{ key: string; dimensions?: BookImageDimensions }>();
  useEffect(() => {
    if (!imageId) return;
    let active = true;
    let request = dimensionsCache.get(key);
    if (!request) {
      request = booksApi.imageDimensions(bookId, imageId).catch(() => undefined);
      dimensionsCache.set(key, request);
      // Bound this display-only cache; user data remains in the existing store.
      if (dimensionsCache.size > 128) dimensionsCache.delete(dimensionsCache.keys().next().value!);
      void request.then((dimensions) => {
        if (!dimensions && dimensionsCache.get(key) === request) dimensionsCache.delete(key);
      });
    }
    void request.then((dimensions) => {
      if (active) setResult({ key, dimensions });
    });
    return () => {
      active = false;
    };
  }, [bookId, imageId, key]);
  return result?.key === key ? result.dimensions : undefined;
}
