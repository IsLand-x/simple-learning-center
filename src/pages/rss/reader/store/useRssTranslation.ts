import {
  useCallback,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';
import { aiApi } from '../../../../api/ai';
import type { AiJob } from '../../../../api/ai/type';

import { Toast } from '@douyinfe/semi-ui';
import type { AiPreferences, OpenAICompatibleConfig } from '../../../../../contracts/ai';
import type { RssItem } from '../../../../../contracts/rss';
import { waitForServerStateWrites } from '../../../../store/serverStateStorage';
import { createUuid } from '../../../../util/uuid';

type TranslationStatus = 'idle' | 'unavailable' | 'generating' | 'ready' | 'error';

interface TranslationTaskState {
  status: TranslationStatus;
  error: string;
}

type UpdateRssItem = (itemId: string, changes: Partial<RssItem>) => void;

const translationStartPromises = new Map<string, Promise<AiJob>>();

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
      const existing = (
        await aiApi.listJobs({ bookId: resourceId, conversationId: conversationId })
      ).find(
        (job) => job.status === 'queued' || job.status === 'running' || job.status === 'completed',
      );
      let job = existing;
      if (!job) {
        let pending = translationStartPromises.get(itemId);
        if (!pending) {
          pending = (async () => {
            await waitForServerStateWrites();
            const createdAt = Date.now();
            return aiApi.startJob({
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
          await aiApi.watchJob(job.id, applyTranslationJob, controller.signal);
        } catch {
          let latest = job;
          while (latest.status === 'queued' || latest.status === 'running') {
            await new Promise((resolve) => window.setTimeout(resolve, 350));
            latest = await aiApi.getJob(job.id);
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
