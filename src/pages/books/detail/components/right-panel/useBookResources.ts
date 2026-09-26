import type { BookImageResource, BookResourcesResponse } from '../../../../../types/books';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { booksApi } from '../../../../../api/books';

export function useBookResources(bookId: string) {
  const [resources, setResources] = useState<BookImageResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const revision = useRef(0);
  const reload = useCallback(async () => {
    if (busy.current) return;
    const current = ++revision.current;
    setLoading(true);
    setError('');
    try {
      const data = await booksApi.listResources(bookId);
      if (current === revision.current) setResources(data.resources);
    } catch (cause) {
      if (current === revision.current)
        setError(cause instanceof Error ? cause.message : '资源库加载失败');
    } finally {
      if (current === revision.current) setLoading(false);
    }
  }, [bookId]);
  useEffect(() => {
    void reload();
    return () => {
      revision.current += 1;
    };
  }, [reload]);

  const update = async (operation: () => Promise<BookResourcesResponse>) => {
    if (busy.current) throw new Error('正在保存资源，请稍候');
    busy.current = true;
    setPending(true);
    const current = ++revision.current;
    try {
      const data = await operation();
      if (current === revision.current) {
        setResources(data.resources);
        setError('');
      }
    } finally {
      busy.current = false;
      setPending(false);
      if (current === revision.current) setLoading(false);
    }
  };
  const mutate = (imageId: string, title?: string) =>
    title === undefined
      ? update(() => booksApi.removeResource(bookId, imageId))
      : update(() => booksApi.saveResource(bookId, { imageId, title }));
  const rename = (imageId: string, title: string) =>
    update(() => booksApi.renameResource(bookId, imageId, { title }));
  return { bookId, resources, loading, error, pending, reload, mutate, rename };
}

export const BookResourcesContext = createContext<ReturnType<typeof useBookResources> | null>(null);
export function useBookResourcesContext() {
  const context = useContext(BookResourcesContext);
  if (!context) throw new Error('缺少书籍资源库上下文');
  return context;
}
