import { useCallback, useRef } from 'react';
import type { StateDomain } from '../../../../../../contracts/state';
import type { AiJobSummary } from '../../../../../api/ai/type';
import { synchronizeLearningState } from '../../../../../store/learningStateSync';

export function useReaderAiStateSync(bookId: string) {
  const revisions = useRef(new Map<string, { notes: number; discussions: number }>());
  const queue = useRef(Promise.resolve());
  return useCallback(
    (job: AiJobSummary) => {
      const revision = job.notesRevision ?? 0;
      const discussionsRevision = job.discussionsRevision ?? 0;
      const previous = revisions.current.get(job.id);
      if (
        job.bookId !== bookId ||
        (revision <= (previous?.notes ?? 0) && discussionsRevision <= (previous?.discussions ?? 0))
      )
        return;
      queue.current = queue.current
        .catch(() => undefined)
        .then(async () => {
          const previous = revisions.current.get(job.id);
          const domains: StateDomain[] = [];
          if (revision > (previous?.notes ?? 0)) domains.push('notes');
          if (discussionsRevision > (previous?.discussions ?? 0)) domains.push('reading');
          if (!domains.length) return;
          await synchronizeLearningState(domains);
          revisions.current.set(job.id, {
            notes: Math.max(revision, previous?.notes ?? 0),
            discussions: Math.max(discussionsRevision, previous?.discussions ?? 0),
          });
        });
      void queue.current.catch((error) => console.warn('同步 AI 保存的笔记或讨论失败', error));
      return queue.current;
    },
    [bookId],
  );
}
