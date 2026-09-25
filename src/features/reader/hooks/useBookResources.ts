import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { serverRequest } from '../../../lib/serverApi';
import type { BookImageResource } from '../model/bookResources';

export function useBookResources(bookId: string) {
  const [resources, setResources] = useState<BookImageResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const revision = useRef(0);
  const base = `/api/books/${encodeURIComponent(bookId)}/resources`;
  const reload = useCallback(async () => {
    if (busy.current) return;
    const current = ++revision.current;
    setLoading(true);
    setError('');
    try {
      const response = await serverRequest(base);
      const data = (await response.json()) as { resources: BookImageResource[] };
      if (current === revision.current) setResources(data.resources);
    } catch (cause) {
      if (current === revision.current)
        setError(cause instanceof Error ? cause.message : '资源库加载失败');
    } finally {
      if (current === revision.current) setLoading(false);
    }
  }, [base]);
  useEffect(() => {
    void reload();
    return () => {
      revision.current += 1;
    };
  }, [reload]);

  const mutate = async (imageId: string, title?: string) => {
    if (busy.current) throw new Error('正在保存资源，请稍候');
    busy.current = true;
    setPending(true);
    const current = ++revision.current;
    try {
      const response = await serverRequest(title === undefined ? `${base}/${imageId}` : base, {
        method: title === undefined ? 'DELETE' : 'POST',
        ...(title === undefined
          ? {}
          : {
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ imageId, title }),
            }),
      });
      const data = (await response.json()) as { resources: BookImageResource[] };
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
  return { bookId, resources, loading, error, pending, reload, mutate };
}

export const BookResourcesContext = createContext<ReturnType<typeof useBookResources> | null>(null);
export function useBookResourcesContext() {
  const context = useContext(BookResourcesContext);
  if (!context) throw new Error('缺少书籍资源库上下文');
  return context;
}
