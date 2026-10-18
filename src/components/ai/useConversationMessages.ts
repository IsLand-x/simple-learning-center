import { useCallback, useEffect, useRef, useState } from 'react';
import { useLearningStore } from '../../store/useLearningStore';
import { subscribeConversationRefresh } from '../../store/conversationSync';

export function useConversationMessages(bookId: string, id: string, enabled = true) {
  const load = useLearningStore((state) => state.loadConversationMessages);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [readyFor, setReadyFor] = useState('');
  const key = `${bookId}:${id}`;
  const generation = useRef(0);
  useEffect(() => {
    if (!enabled) return;
    const revision = ++generation.current;
    setLoading(true);
    setError('');
    setNextCursor(null);
    let initialized = false;
    const refresh = async () => {
      try {
        const page = await load(bookId, id);
        if (revision !== generation.current) return;
        if (!initialized) setNextCursor(page.nextCursor);
        initialized = true;
        setError('');
      } catch (reason) {
        if (revision === generation.current)
          setError(reason instanceof Error ? reason.message : '读取对话消息失败');
      } finally {
        if (revision === generation.current) {
          setLoading(false);
          setReadyFor(key);
        }
      }
    };
    void refresh();
    const unsubscribe = subscribeConversationRefresh(`messages:${id}`, refresh);
    return () => {
      generation.current = revision + 1;
      unsubscribe();
    };
  }, [bookId, id, key, load, attempt, enabled]);
  const loadMore = async () => {
    if (!nextCursor || loading) return;
    const revision = generation.current;
    setLoading(true);
    try {
      const page = await load(bookId, id, nextCursor);
      if (revision === generation.current) {
        setNextCursor(page.nextCursor);
        setError('');
      }
    } catch (reason) {
      if (revision === generation.current)
        setError(reason instanceof Error ? reason.message : '读取更早消息失败');
    } finally {
      if (revision === generation.current) setLoading(false);
    }
  };
  return {
    loading: !enabled || loading || readyFor !== key,
    error,
    hasMore: Boolean(nextCursor),
    loadMore,
    retry: useCallback(() => setAttempt((value) => value + 1), []),
  };
}
