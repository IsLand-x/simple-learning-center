import { useCallback, useRef } from 'react';
import type { AiJob } from '../../../../../api/ai/type';
import { synchronizeLearningState } from '../../../../../store/learningStateSync';

export function useReaderNoteSync(bookId: string) {
  const revisions = useRef(new Map<string, number>());
  const queue = useRef(Promise.resolve());
  return useCallback(
    (job: AiJob) => {
      const revision = job.notesRevision ?? 0;
      if (job.bookId !== bookId || revision <= (revisions.current.get(job.id) ?? 0)) return;
      queue.current = queue.current
        .catch(() => undefined)
        .then(async () => {
          if (revision <= (revisions.current.get(job.id) ?? 0)) return;
          await synchronizeLearningState(['notes']);
          revisions.current.set(job.id, revision);
        });
      void queue.current.catch((error) => console.warn('同步 AI 修改的阅读笔记失败', error));
      return queue.current;
    },
    [bookId],
  );
}
