import {
  useCallback,
  useEffect,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';
import { getAiJob, listAiJobs, startAiJob, watchAiJob, type AiJob } from '../../../lib/aiJobs';
import { waitForServerStateWrites } from '../../../lib/serverStateStorage';
import { createUuid } from '../../../lib/uuid';
import type { AiPreferences, OpenAICompatibleConfig, RssItem } from '../../../types';
import { Toast } from '@douyinfe/semi-ui';

export type SummaryStatus = 'idle' | 'unavailable' | 'generating' | 'ready' | 'error';
type TranslationStatus = 'idle' | 'unavailable' | 'generating' | 'ready' | 'error';

export interface TranslationTaskState {
  status: TranslationStatus;
  error: string;
}

type UpdateRssItem = (itemId: string, changes: Partial<RssItem>) => void;

const summaryStartPromises = new Map<string, Promise<AiJob>>();
const translationStartPromises = new Map<string, Promise<AiJob>>();

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
        await watchAiJob(job.id, applySummaryJob, controller.signal);
      } catch (watchError) {
        if (disposed || (watchError instanceof Error && watchError.name === 'AbortError')) return;
        let latest = job;
        while (!disposed && (latest.status === 'queued' || latest.status === 'running')) {
          await new Promise((resolve) => window.setTimeout(resolve, 350));
          latest = await getAiJob(job.id);
          applySummaryJob(latest);
        }
      }
    };
    const start = async () => {
      setStatus('generating');
      try {
        const existing = (await listAiJobs(resourceId, conversationId)).find(
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
              return startAiJob({
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

export function useRssTranslation({
  aiPreferences,
  configs,
  selectedItem,
  selectedItemIdRef,
  setTranslationVisible,
  updateRssItem,
}: {
  aiPreferences: AiPreferences;
  configs: OpenAICompatibleConfig[];
  selectedItem?: RssItem;
  selectedItemIdRef: MutableRefObject<string | null>;
  setTranslationVisible: Dispatch<SetStateAction<boolean>>;
  updateRssItem: UpdateRssItem;
}) {
  const [translationTasks, setTranslationTasks] = useState<Record<string, TranslationTaskState>>(
    {},
  );

  const translateCurrentPage = useCallback(async () => {
    if (!selectedItem) return;
    const item = selectedItem;
    const itemId = item.id;
    const updateTranslationTask = (changes: Partial<TranslationTaskState>) => {
      setTranslationTasks((current) => ({
        ...current,
        [itemId]: {
          status: current[itemId]?.status ?? 'idle',
          error: current[itemId]?.error ?? '',
          ...changes,
        },
      }));
    };
    if (item.aiTranslationHtml || item.aiTranslation) {
      updateTranslationTask({ status: 'ready', error: '' });
      setTranslationVisible((current) => !current);
      return;
    }
    const provider = aiPreferences.provider;
    const config = provider
      ? configs.find((candidate) => provider === `api:${candidate.id}`)
      : configs[0];
    const model = config?.models.includes(aiPreferences.model)
      ? aiPreferences.model
      : config?.models[0];
    if (!config || !model) {
      updateTranslationTask({ status: 'unavailable', error: '请先在设置页添加并选择模型' });
      Toast.warning('请先在设置页添加并选择模型');
      return undefined;
    }
    const resourceId = `rss:${itemId}`;
    const conversationId = `rss-translation-v2:${itemId}`;
    updateTranslationTask({ status: 'generating', error: '' });
    setTranslationVisible(true);
    const applyTranslationJob = (job: AiJob) => {
      if (job.status === 'queued' || job.status === 'running') {
        updateTranslationTask({ status: 'generating', error: '' });
        return;
      }
      translationStartPromises.delete(itemId);
      if (job.status === 'completed') {
        updateRssItem(itemId, {
          aiTranslation: job.content,
          aiTranslationHtml: job.translationHtml,
          aiTranslationUpdatedAt: Date.now(),
          aiTranslationSourceFetchedAt: Number(item.fullContentFetchedAt || item.fetchedAt || 0),
        });
        updateTranslationTask({ status: 'ready', error: '' });
      } else if (job.status === 'failed') {
        updateTranslationTask({ status: 'error', error: job.error || '页面翻译失败' });
      }
    };
    try {
      const existing = (await listAiJobs(resourceId, conversationId)).find(
        (job) => job.status === 'queued' || job.status === 'running' || job.status === 'completed',
      );
      let job = existing;
      if (!job) {
        let pending = translationStartPromises.get(itemId);
        if (!pending) {
          pending = (async () => {
            await waitForServerStateWrites();
            const createdAt = Date.now();
            return startAiJob({
              configId: config.id,
              model,
              bookId: resourceId,
              resourceType: 'rss',
              rssItemId: itemId,
              purpose: 'translation',
              conversationId,
              userMessage: {
                id: createUuid(),
                content:
                  '请读取当前 RSS 正文并完整翻译成简体中文。逐一翻译服务端提供的文本片段，严格保留片段 id；不要总结、删减、补写或解释。',
                createdAt,
              },
              session: { title: `页面翻译：${item.title}`.slice(0, 100), createdAt },
              currentText: '',
            });
          })();
          translationStartPromises.set(itemId, pending);
        }
        job = await pending;
      }
      applyTranslationJob(job);
      if (job.status === 'queued' || job.status === 'running') {
        const controller = new AbortController();
        try {
          await watchAiJob(job.id, applyTranslationJob, controller.signal);
        } catch {
          let latest = job;
          while (latest.status === 'queued' || latest.status === 'running') {
            await new Promise((resolve) => window.setTimeout(resolve, 350));
            latest = await getAiJob(job.id);
            applyTranslationJob(latest);
          }
        }
      }
    } catch (translationError) {
      translationStartPromises.delete(itemId);
      const message = translationError instanceof Error ? translationError.message : '页面翻译失败';
      updateTranslationTask({ status: 'error', error: message });
      if (selectedItemIdRef.current === itemId) Toast.error(message);
    }
  }, [
    aiPreferences.model,
    aiPreferences.provider,
    configs,
    selectedItem,
    selectedItemIdRef,
    setTranslationVisible,
    updateRssItem,
  ]);

  return { translateCurrentPage, translationTasks };
}
