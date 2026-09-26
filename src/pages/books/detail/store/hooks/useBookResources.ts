import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { serverRequest } from '../../../../../util/api/serverApi';
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

  const update = async (path: string, method: string, payload?: object) => {
    if (busy.current) throw new Error('正在保存资源，请稍候');
    busy.current = true;
    setPending(true);
    const current = ++revision.current;
    try {
      const response = await serverRequest(path, {
        method,
        ...(payload
          ? {
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            }
          : {}),
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
  const mutate = (imageId: string, title?: string) =>
    title === undefined
      ? update(`${base}/${imageId}`, 'DELETE')
      : update(base, 'POST', { imageId, title });
  const rename = (imageId: string, title: string) =>
    update(`${base}/${imageId}`, 'PATCH', { title });
  return { bookId, resources, loading, error, pending, reload, mutate, rename };
}

export const BookResourcesContext = createContext<ReturnType<typeof useBookResources> | null>(null);
export function useBookResourcesContext() {
  const context = useContext(BookResourcesContext);
  if (!context) throw new Error('缺少书籍资源库上下文');
  return context;
}
