import { useCallback, useRef } from 'react';
import type { AiJobSummary } from '../../../../../api/ai/type';
import { synchronizeLearningState } from '../../../../../store/learningStateSync';

export function useReaderAiStateSync(bookId: string) {
  const revisions = useRef(new Map<string, number>());
  const queue = useRef(Promise.resolve());
  return useCallback(
    (job: AiJobSummary) => {
      const revision = job.discussionsRevision ?? 0;
      if (job.bookId !== bookId || revision <= (revisions.current.get(job.id) ?? 0)) return;
      queue.current = queue.current
        .catch(() => undefined)
        .then(async () => {
          const previous = revisions.current.get(job.id) ?? 0;
          if (revision <= previous) return;
          await synchronizeLearningState(['reading']);
          revisions.current.set(job.id, Math.max(revision, previous));
        });
      void queue.current.catch((error) => console.warn('同步 AI 保存的讨论失败', error));
      return queue.current;
    },
    [bookId],
  );
}
