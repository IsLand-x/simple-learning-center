import { useEffect, useState } from 'react';
import { aiApi } from '../../../../api/ai';
import type { AiJob } from '../../../../api/ai/type';

import type { AiPreferences, OpenAICompatibleConfig } from '../../../../../contracts/ai';
import type { RssItem } from '../../../../../contracts/rss';
import { waitForServerStateWrites } from '../../../../store/serverStateStorage';
import { createUuid } from '../../../../util/uuid';

type SummaryStatus = 'idle' | 'unavailable' | 'generating' | 'ready' | 'error';
type UpdateRssItem = (itemId: string, changes: Partial<RssItem>) => void;

const summaryStartPromises = new Map<string, Promise<AiJob>>();

export function useRssAutoSummary({
  aiPreferences,
  configs,
  isSelectedVideo,
  selectedItem,
  updateRssItem,
}: {
  aiPreferences: AiPreferences;
  configs: OpenAICompatibleConfig[];
  isSelectedVideo: boolean;
  selectedItem?: RssItem;
  updateRssItem: UpdateRssItem;
}) {
  const [status, setStatus] = useState<SummaryStatus>('idle');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!selectedItem) {
      setStatus('idle');
      setError('');
      return undefined;
    }
    if (isSelectedVideo) {
      setStatus('idle');
      setError('');
      return undefined;
    }
    if (selectedItem.aiSummary && selectedItem.aiSummaryVersion === 2) {
      setStatus('ready');
      setError('');
      return undefined;
    }
    const provider = aiPreferences.provider;
    const config = provider ? configs.find((item) => provider === `api:${item.id}`) : configs[0];
    const model = config?.models.includes(aiPreferences.model)
      ? aiPreferences.model
      : config?.models[0];
    if (!config || !model) {
      setStatus('unavailable');
      return undefined;
    }
    let disposed = false;
    const controller = new AbortController();
    const resourceId = `rss:${selectedItem.id}`;
    const conversationId = `rss-summary-v2:${selectedItem.id}`;
    const applySummaryJob = (job: AiJob) => {
      if (disposed) return;
      if (job.status === 'queued' || job.status === 'running') {
        setStatus('generating');
        return;
      }
      summaryStartPromises.delete(selectedItem.id);
      if (job.status === 'completed') {
        updateRssItem(selectedItem.id, {
          aiSummary: job.content,
          aiSummaryUpdatedAt: Date.now(),
          aiSummaryVersion: 2,
        });
        setStatus('ready');
        setError('');
      } else if (job.status === 'failed') {
        setStatus('error');
        setError(job.error || 'AI 摘要生成失败');
      }
    };
    const monitor = async (job: AiJob) => {
      applySummaryJob(job);
      if (job.status !== 'queued' && job.status !== 'running') return;
      try {
        await aiApi.watchJob(job.id, applySummaryJob, controller.signal);
      } catch (watchError) {
        if (disposed || (watchError instanceof Error && watchError.name === 'AbortError')) return;
        let latest = job;
        while (!disposed && (latest.status === 'queued' || latest.status === 'running')) {
          await new Promise((resolve) => window.setTimeout(resolve, 350));
          latest = await aiApi.getJob(job.id);
          applySummaryJob(latest);
        }
      }
    };
    const start = async () => {
      setStatus('generating');
      try {
        const existing = (
          await aiApi.listJobs({ bookId: resourceId, conversationId: conversationId })
        ).find(
          (job) =>
            job.status === 'queued' || job.status === 'running' || job.status === 'completed',
        );
        let job = existing;
        if (!job) {
          let pending = summaryStartPromises.get(selectedItem.id);
          if (!pending) {
            pending = (async () => {
              await waitForServerStateWrites();
              const createdAt = Date.now();
              return aiApi.startJob({
                configId: config.id,
                model,
                bookId: resourceId,
                resourceType: 'rss',
                rssItemId: selectedItem.id,
                purpose: 'summary',
                conversationId,
                userMessage: {
                  id: createUuid(),
                  content:
                    '请用两到四个完整句子，简要总结这篇文章说了什么，总计不超过 180 个汉字。不要使用标题、列表或 Markdown，不要以省略号结尾，每句话都要完整表达。',
                  createdAt,
                },
                session: { title: `自动摘要：${selectedItem.title}`.slice(0, 100), createdAt },
                currentText: '',
              });
            })();
            summaryStartPromises.set(selectedItem.id, pending);
          }
          job = await pending;
        }
        await monitor(job);
      } catch (startError) {
        summaryStartPromises.delete(selectedItem.id);
        if (!disposed) {
          setStatus('error');
          setError(startError instanceof Error ? startError.message : 'AI 摘要生成失败');
        }
      }
    };
    void start();
    return () => {
      disposed = true;
      controller.abort();
    };
  }, [
    aiPreferences.model,
    aiPreferences.provider,
    configs,
    isSelectedVideo,
    selectedItem,
    updateRssItem,
  ]);

  return { summaryError: error, summaryStatus: status };
}
