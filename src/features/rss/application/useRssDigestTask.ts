import { useCallback, useState } from 'react';
import { Toast } from '@douyinfe/semi-ui';
import { getAiJob, watchAiJob, type AiJob } from '../../../lib/aiJobs';
import { synchronizeLearningState } from '../../../lib/learningStateSync';
import { generateRssDigest } from '../../../lib/rssApi';
import { waitForServerStateWrites } from '../../../lib/serverStateStorage';

export function useRssDigestTask({
  selectedDigestDate,
  todayKey,
}: {
  selectedDigestDate?: string;
  todayKey: string;
}) {
  const [digestGenerating, setDigestGenerating] = useState(false);
  const [digestError, setDigestError] = useState('');

  const runDigest = useCallback(
    async (date = selectedDigestDate ?? todayKey) => {
      setDigestGenerating(true);
      setDigestError('');
      try {
        await waitForServerStateWrites();
        const result = await generateRssDigest(date, true);
        if (!result.job) {
          await synchronizeLearningState();
          setDigestGenerating(false);
          return;
        }
        const applyDigestJob = async (job: AiJob) => {
          if (job.status === 'queued' || job.status === 'running') return;
          await synchronizeLearningState();
          if (job.status === 'completed') {
            Toast.success('日报已更新');
          } else if (job.status === 'failed') {
            setDigestError(job.error || '日报生成失败');
          }
          setDigestGenerating(false);
        };
        try {
          await watchAiJob(
            result.job.id,
            (job) => void applyDigestJob(job),
            new AbortController().signal,
          );
        } catch {
          let latest = result.job;
          while (latest.status === 'queued' || latest.status === 'running') {
            await new Promise((resolve) => window.setTimeout(resolve, 500));
            latest = await getAiJob(latest.id);
          }
          await applyDigestJob(latest);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : '日报生成失败';
        await synchronizeLearningState().catch(() => undefined);
        setDigestGenerating(false);
        setDigestError(message);
        Toast.error(message);
      }
    },
    [selectedDigestDate, todayKey],
  );

  return { digestError, digestGenerating, runDigest };
}
