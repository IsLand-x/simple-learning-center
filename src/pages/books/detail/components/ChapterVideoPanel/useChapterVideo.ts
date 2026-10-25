import { useEffect, useRef, useState } from 'react';
import type { BookItem } from '../../../../../../contracts/books';
import type { ChapterVideo, ChapterVideoNarration } from '../../../../../../contracts/reading';
import { aiApi } from '../../../../../api/ai';
import { booksApi } from '../../../../../api/books';
import { useLearningStore } from '../../../../../store/useLearningStore';
import {
  refreshServerState,
  waitForServerStateWrites,
} from '../../../../../store/serverStateStorage';
import { coerceAiReasoningEffort } from '../../../../../util/ai/aiReasoning';
import { createUuid } from '../../../../../util/uuid';
import { getBookPassages } from '../AssistantPanel/bookSearch';
import { useReaderAiJobs } from '../AssistantPanel/useReaderAiActivity';
import { useChapterVideoJobs } from './useChapterVideoJobs';

async function syncVideos() {
  await refreshServerState(['reading']);
  await useLearningStore.persist.rehydrate();
}

export function useChapterVideo(
  book: BookItem,
  chapterId: string | undefined,
  restoreScope: (chapterId: string | undefined) => void,
) {
  const configs = useLearningStore((state) => state.openAIConfigs);
  const preferences = useLearningStore((state) => state.aiPreferences);
  const setPreferences = useLearningStore((state) => state.setAiPreferences);
  const videos = useLearningStore((state) => state.chapterVideos);
  const { reportJob } = useReaderAiJobs();
  const { jobs, loading, error: jobsError, refresh: refreshJobs } = useChapterVideoJobs(book.id);
  const job = jobs
    .filter((item) => item.bookId === book.id && item.chapterId === chapterId)
    .sort((left, right) => right.createdAt - left.createdAt)[0];
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [stage, setStage] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const preparation = useRef<AbortController>();
  const starting = useRef(false);
  const synced = useRef(new Set<string>());
  const restoredScope = useRef(false);
  const latestBook = useRef(book);
  latestBook.current = book;
  const config = configs.find((item) => preferences.provider === `api:${item.id}`);
  const model = config?.models.includes(preferences.model) ? preferences.model : config?.models[0];
  const busy = pending || job?.status === 'queued' || job?.status === 'running';

  useEffect(() => {
    if (loading || restoredScope.current) return;
    restoredScope.current = true;
    const running = jobs.find((task) => task.status === 'queued' || task.status === 'running');
    if (running) restoreScope(running.chapterId);
  }, [jobs, loading, restoreScope]);

  useEffect(() => {
    let disposed = false;
    setStage('');
    if (!job) return;
    if (job.status === 'completed' && !synced.current.has(job.id)) {
      void syncVideos()
        .then(() => {
          synced.current.add(job.id);
        })
        .catch((cause: unknown) => {
          if (!disposed)
            setError(
              cause instanceof Error ? cause.message : '视频已生成，同步失败，请重新打开面板',
            );
        });
    }
    return () => {
      disposed = true;
    };
  }, [job]);

  useEffect(() => {
    setError('');
    setCancelled(false);
  }, [chapterId]);

  const generate = async (videoNarration?: ChapterVideoNarration) => {
    if (starting.current || loading || busy || deleting || !config || !model) return;
    starting.current = true;
    setPending(true);
    setError('');
    setCancelled(false);
    const controller = new AbortController();
    preparation.current = controller;
    try {
      setStage('正在准备书籍正文');
      await getBookPassages(latestBook.current);
      await waitForServerStateWrites();
      controller.signal.throwIfAborted();
      const now = Date.now();
      const reasoning = coerceAiReasoningEffort(preferences.reasoningEffort, config, model);
      const started = await aiApi.startJob({
        configId: config.id,
        model,
        reasoningEffort: reasoning === 'auto' ? undefined : reasoning,
        bookId: book.id,
        purpose: 'chapter-video',
        chapterId,
        videoNarration,
        conversationId: `chapter-video:${createUuid()}`,
        userMessage: {
          id: createUuid(),
          content: chapterId ? '生成所选大章的讲解视频' : '生成全书导读视频',
          createdAt: now,
        },
        session: { title: '章节视频', createdAt: now },
        currentText: '',
      });
      reportJob(controller.signal.aborted ? await aiApi.cancelJob(started.id) : started);
      await refreshJobs();
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(cause instanceof Error ? cause.message : '无法生成章节视频');
    } finally {
      starting.current = false;
      setPending(false);
      preparation.current = undefined;
    }
  };
  const cancel = async (jobId?: string) => {
    if (pending && !jobId) {
      preparation.current?.abort();
      setCancelled(true);
      return;
    }
    const targetId = jobId ?? job?.id;
    if (!targetId) return;
    try {
      reportJob(await aiApi.cancelJob(targetId));
      await refreshJobs();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '取消失败，请重试');
    }
  };
  const remove = async (video: ChapterVideo) => {
    if (deleting) return;
    setDeleting(true);
    setError('');
    try {
      await booksApi.deleteChapterVideo(book.id, video.id);
      await syncVideos();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '删除视频失败');
    } finally {
      setDeleting(false);
    }
  };
  return {
    configs,
    preferences,
    model,
    busy,
    loading,
    pending,
    jobs,
    deleting,
    stage,
    configured: Boolean(config && model),
    videos: videos
      .filter((video) => video.bookId === book.id)
      .sort((left, right) => right.generatedAt - left.generatedAt),
    error: error || jobsError,
    cancelled,
    generate,
    cancel,
    remove,
    selectModel: (selection: unknown) => {
      if (
        !Array.isArray(selection) ||
        typeof selection[0] !== 'string' ||
        typeof selection[1] !== 'string'
      )
        return;
      const selected = configs.find((item) => `api:${item.id}` === selection[0]);
      if (selected?.models.includes(selection[1]))
        setPreferences({ provider: `api:${selected.id}`, model: selection[1] });
    },
  };
}
