import { useEffect, useRef, useState } from 'react';
import type { BookItem } from '../../../../../../contracts/books';
import { aiApi } from '../../../../../api/ai';
import { useLearningStore } from '../../../../../store/useLearningStore';
import {
  refreshServerState,
  waitForServerStateWrites,
} from '../../../../../store/serverStateStorage';
import { coerceAiReasoningEffort } from '../../../../../util/ai/aiReasoning';
import { createUuid } from '../../../../../util/uuid';
import { getBookPassages } from '../AssistantPanel/bookSearch';
import { useReaderAiActivity } from '../AssistantPanel/useReaderAiActivity';

export function useChapterMindMap(book: BookItem, chapterId: string) {
  const configs = useLearningStore((state) => state.openAIConfigs);
  const preferences = useLearningStore((state) => state.aiPreferences);
  const setPreferences = useLearningStore((state) => state.setAiPreferences);
  const mindMap = useLearningStore((state) =>
    state.chapterMindMaps.find((map) => map.bookId === book.id && map.chapterId === chapterId),
  );
  const { jobs, reportJob } = useReaderAiActivity();
  const job = jobs
    .filter(
      (item) =>
        item.purpose === 'mindmap' && item.bookId === book.id && item.chapterId === chapterId,
    )
    .sort((left, right) => right.createdAt - left.createdAt)[0];
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [stage, setStage] = useState('');
  const [indexStatus, setIndexStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const starting = useRef(false);
  const synced = useRef(new Set<string>());
  const latestBook = useRef(book);
  latestBook.current = book;
  const config = configs.find((item) => preferences.provider === `api:${item.id}`);
  const model = config?.models.includes(preferences.model) ? preferences.model : config?.models[0];
  const busy = pending || job?.status === 'queued' || job?.status === 'running';

  useEffect(() => {
    let disposed = false;
    setIndexStatus('loading');
    void getBookPassages(latestBook.current)
      .then(() => {
        if (!disposed) setIndexStatus('ready');
      })
      .catch((cause: unknown) => {
        if (disposed) return;
        setIndexStatus('failed');
        setError(cause instanceof Error ? cause.message : '章节索引建立失败');
      });
    return () => {
      disposed = true;
    };
  }, [book.id, book.fileSize]);

  useEffect(() => {
    let disposed = false;
    if (!job) {
      setStage('');
      return;
    }
    if (job.status === 'running' || job.status === 'queued') {
      void aiApi
        .getJob(job.id)
        .then((snapshot) => {
          if (!disposed) setStage(snapshot.content);
        })
        .catch(() => undefined);
    }
    if (job.status === 'completed' && !synced.current.has(job.id)) {
      void refreshServerState(['reading'])
        .then(() => useLearningStore.persist.rehydrate())
        .then(() => {
          synced.current.add(job.id);
        })
        .catch((cause: unknown) => {
          if (!disposed)
            setError(
              cause instanceof Error ? cause.message : '导图已生成，同步失败，请重新打开面板',
            );
        });
    }
    return () => {
      disposed = true;
    };
  }, [job]);

  useEffect(() => {
    setError('');
    setStage('');
  }, [chapterId]);

  const generate = async () => {
    if (starting.current || busy || !config || !model || !chapterId) return;
    starting.current = true;
    setPending(true);
    setError('');
    try {
      setStage('正在准备章节正文');
      await getBookPassages(latestBook.current);
      await waitForServerStateWrites();
      const timestamp = Date.now();
      const reasoning = coerceAiReasoningEffort(preferences.reasoningEffort, config, model);
      reportJob(
        await aiApi.startJob({
          configId: config.id,
          model,
          reasoningEffort: reasoning === 'auto' ? undefined : reasoning,
          bookId: book.id,
          purpose: 'mindmap',
          chapterId,
          conversationId: `mindmap:${createUuid()}`,
          userMessage: {
            id: createUuid(),
            createdAt: timestamp,
            content: '生成所选章节的思维导图',
          },
          session: { title: '章节思维导图', createdAt: timestamp },
          currentText: '',
        }),
      );
      setIndexStatus('ready');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '无法生成章节思维导图');
    } finally {
      starting.current = false;
      setPending(false);
    }
  };
  const cancel = async () => {
    if (!job) return;
    try {
      reportJob(await aiApi.cancelJob(job.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '取消失败，请重试');
    }
  };
  return {
    mindMap,
    configs,
    preferences,
    model,
    configured: Boolean(config && model),
    busy,
    indexStatus,
    stage,
    error: error || (job?.status === 'failed' ? job.error || '导图生成失败，请重试' : ''),
    generate,
    cancel,
    selectModel: (selection: unknown) => {
      if (
        !Array.isArray(selection) ||
        typeof selection[0] !== 'string' ||
        typeof selection[1] !== 'string'
      )
        return;
      const selectedConfig = configs.find((item) => `api:${item.id}` === selection[0]);
      if (selectedConfig?.models.includes(selection[1]))
        setPreferences({ provider: `api:${selectedConfig.id}`, model: selection[1] });
    },
  };
}
