import { aiApi } from '../../../../api/ai';
import type { AiJob } from '../../../../types/ai';
import { rssApi } from '../../../../api/rss';
import { useCallback, useState } from 'react';
import { Toast } from '@douyinfe/semi-ui';

import { synchronizeLearningState } from '../../../../util/state/learningStateSync';

import { waitForServerStateWrites } from '../../../../util/state/serverStateStorage';

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
        const result = await rssApi.generateDigest({ date: date, force: true });
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
          await aiApi.watchJob(
            result.job.id,
            (job) => void applyDigestJob(job),
            new AbortController().signal,
          );
        } catch {
          let latest = result.job;
          while (latest.status === 'queued' || latest.status === 'running') {
            await new Promise((resolve) => window.setTimeout(resolve, 500));
            latest = await aiApi.getJob(latest.id);
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
