import { useCallback, useState } from 'react';
import type { ChapterVideoJob } from '../../../../../../contracts/reading';
import { aiApi } from '../../../../../api/ai';
import { useReaderJobPolling } from '../AssistantPanel/useReaderJobPolling';

export function useChapterVideoJobs(bookId: string) {
  const [jobs, setJobs] = useState<ChapterVideoJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const response = await aiApi.listChapterVideoJobs(bookId, signal);
        if (signal?.aborted) return;
        setJobs((previous) =>
          response.jobs.length === previous.length &&
          response.jobs.every(
            (job, index) =>
              job.id === previous[index]?.id && job.revision === previous[index]?.revision,
          )
            ? previous
            : response.jobs,
        );
        setError('');
      } catch (cause) {
        if (!signal?.aborted)
          setError(cause instanceof Error ? cause.message : '无法读取视频任务进度，请稍后重试');
        throw cause;
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [bookId],
  );
  useReaderJobPolling(
    refresh,
    jobs.some((job) => job.status === 'queued' || job.status === 'running'),
  );
  return { jobs, loading, error, refresh };
}
