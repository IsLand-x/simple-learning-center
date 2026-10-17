import { useCallback, useEffect, useState } from 'react';
import { useLearningStore } from '../../store/useLearningStore';
import { subscribeConversationRefresh } from '../../store/conversationSync';

export function useConversationSummaries(bookId: string) {
  const load = useLearningStore((state) => state.loadConversationSummaries);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let disposed = false;
    setLoading(true);
    setError('');
    const refresh = async () => {
      try {
        await load(bookId);
        if (!disposed) setError('');
      } catch (reason) {
        if (!disposed) setError(reason instanceof Error ? reason.message : '读取对话列表失败');
      } finally {
        if (!disposed) setLoading(false);
      }
    };
    void refresh();
    const unsubscribe = subscribeConversationRefresh(`summaries:${bookId}`, refresh);
    return () => {
      disposed = true;
      unsubscribe();
    };
  }, [bookId, load, attempt]);
  return { loading, error, retry: useCallback(() => setAttempt((value) => value + 1), []) };
}
