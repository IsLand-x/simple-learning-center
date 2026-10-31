import { useEffect, useMemo, useRef, useState } from 'react';
import type { BookItem } from '../../../../../../contracts/books';
import type {
  ChapterVideo,
  ChapterVideoJob,
  ChapterVideoNarration,
} from '../../../../../../contracts/reading';
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
  restoreScope?: (chapterId: string | undefined) => void,
) {
  const rawConfigs = useLearningStore((state) => state.openAIConfigs);
  const configs = useMemo(() => rawConfigs.filter((item) => !item.oauthProvider), [rawConfigs]);
  const preferences = useLearningStore((state) => state.aiPreferences);
  const setPreferences = useLearningStore((state) => state.setAiPreferences);
  const videos = useLearningStore((state) => state.chapterVideos);
  const { reportJob } = useReaderAiJobs();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [stage, setStage] = useState('');
  const [pendingScope, setPendingScope] = useState<{
    chapterId: string | undefined;
    chapterTitle: string;
  } | null>(null);
  const {
    jobs,
    loading,
    error: jobsError,
    refresh: refreshJobs,
  } = useChapterVideoJobs(book.id, pending);
  const config = configs.find((item) => preferences.provider === `api:${item.id}`) ?? configs[0];
  const model = config?.models.includes(preferences.model) ? preferences.model : config?.models[0];
  const pendingJob: ChapterVideoJob | undefined = useMemo(() => {
    if (!pending || !pendingScope) return undefined;
    return {
      id: 'pending-job',
      bookId: book.id,
      chapterId: pendingScope.chapterId,
      chapterTitle: pendingScope.chapterTitle,
      model: model ?? '',
      status: 'running',
      revision: 0,
      content: stage || '正在准备书籍正文',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }, [pending, pendingScope, book.id, model, stage]);
  const displayJobs = useMemo(() => {
    if (!pendingJob) return jobs;
    const sameRunning = jobs.some(
      (item) =>
        item.chapterId === pendingJob.chapterId &&
        (item.status === 'queued' || item.status === 'running'),
    );
    return sameRunning ? jobs : [pendingJob, ...jobs];
  }, [jobs, pendingJob]);
  const job = displayJobs
    .filter((item) => item.bookId === book.id && item.chapterId === chapterId)
    .sort((left, right) => right.createdAt - left.createdAt)[0];
  const [deleting, setDeleting] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const preparation = useRef<AbortController>();
  const starting = useRef(false);
  const synced = useRef(new Set<string>());
  const restoredScope = useRef(false);
  const latestBook = useRef(book);
  latestBook.current = book;
  const busy = pending || job?.status === 'queued' || job?.status === 'running';

  useEffect(() => {
    if (loading || restoredScope.current) return;
    restoredScope.current = true;
    const running = jobs.find((task) => task.status === 'queued' || task.status === 'running');
    if (running) restoreScope?.(running.chapterId);
  }, [jobs, loading, restoreScope]);

  useEffect(() => {
    let disposed = false;
    const completed = jobs.filter(
      (item) => item.status === 'completed' && !synced.current.has(item.id),
    );
    if (completed.length) {
      completed.forEach((item) => synced.current.add(item.id));
      void syncVideos().catch((cause: unknown) => {
        completed.forEach((item) => synced.current.delete(item.id));
        if (!disposed)
          setError(cause instanceof Error ? cause.message : '视频已生成，同步失败，请重新打开面板');
      });
    }
    return () => {
      disposed = true;
    };
  }, [jobs]);

  useEffect(() => {
    setError('');
    setCancelled(false);
  }, [chapterId]);

  const generate = async (
    videoNarration?: ChapterVideoNarration,
    target?: { chapterId: string | undefined },
  ) => {
    const targetChapterId = target ? target.chapterId : chapterId;
    const generating = displayJobs.some(
      (item) =>
        item.chapterId === targetChapterId &&
        (item.status === 'queued' || item.status === 'running'),
    );
    if (starting.current || loading || generating || deleting || !config || !model) return false;
    starting.current = true;
    const targetTitle = targetChapterId
      ? (book.toc.find((t) => t.id === targetChapterId)?.label ?? '章节讲解')
      : '全书导读';
    setPending(true);
    setStage('正在准备书籍正文');
    setPendingScope({ chapterId: targetChapterId, chapterTitle: targetTitle });
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
        chapterId: targetChapterId,
        videoNarration,
        conversationId: `chapter-video:${createUuid()}`,
        userMessage: {
          id: createUuid(),
          content: targetChapterId ? '生成所选大章的讲解视频' : '生成全书导读视频',
          createdAt: now,
        },
        session: { title: '章节视频', createdAt: now },
        currentText: '',
      });
      reportJob(controller.signal.aborted ? await aiApi.cancelJob(started.id) : started);
      await refreshJobs();
      return true;
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(cause instanceof Error ? cause.message : '无法生成章节视频');
      return false;
    } finally {
      starting.current = false;
      setPending(false);
      setPendingScope(null);
      preparation.current = undefined;
    }
  };
  const cancel = async (jobId?: string) => {
    if (pending && (!jobId || jobId === 'pending-job')) {
      preparation.current?.abort();
      setCancelled(true);
      return;
    }
    const targetId = jobId ?? job?.id;
    if (!targetId || targetId === 'pending-job') return;
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
  const removeJob = async (jobId: string) => {
    setError('');
    try {
      await aiApi.deleteChapterVideoJob(book.id, jobId);
      await refreshJobs();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '删除任务记录失败');
      throw cause;
    }
  };
  return {
    configs,
    preferences,
    model,
    busy,
    loading,
    pending,
    jobs: displayJobs,
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
    removeJob,
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
