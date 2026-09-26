import { useCallback, useEffect } from 'react';
import { getAiJob, listAiJobs, watchAiJob, type AiJob } from '../../../../../util/ai/aiJobs';
import { synchronizeLearningState } from '../../../../../util/state/learningStateSync';
import { useLearningStore } from '../../../../../util/state/useLearningStore';
import type { BookItem } from '../../../../../util/types';
import type { ConversationJobControls } from '../../../../../util/ai/conversationJobTypes';
import type { MutableRefObject } from 'react';

export function useReaderConversationJobs({
  book,
  conversationId,
  reportJob,
  trackedJobs,
  lastAppliedJobRef,
  synchronizedNoteRevisionsRef,
  noteSyncQueueRef,
  activeJobId,
  setActiveJobId,
  setStreamingAssistant,
  setStatus,
  setStatusMessage,
}: ConversationJobControls & {
  book: BookItem;
  conversationId: string;
  reportJob: (job: AiJob) => void;
  trackedJobs: AiJob[];
  lastAppliedJobRef: MutableRefObject<AiJob | undefined>;
  synchronizedNoteRevisionsRef: MutableRefObject<Map<string, number>>;
  noteSyncQueueRef: MutableRefObject<Promise<void>>;
}) {
  const applyJob = useCallback(
    (job: AiJob) => {
      reportJob(job);
      const previous = lastAppliedJobRef.current;
      if (
        previous &&
        (previous.createdAt > job.createdAt ||
          (previous.id === job.id && previous.revision >= job.revision))
      )
        return;
      lastAppliedJobRef.current = job;
      const notesRevision = Number(job.notesRevision || 0);
      const synchronizedRevision = synchronizedNoteRevisionsRef.current.get(job.id) ?? 0;
      if (notesRevision > synchronizedRevision) {
        synchronizedNoteRevisionsRef.current.set(job.id, notesRevision);
        noteSyncQueueRef.current = noteSyncQueueRef.current
          .catch(() => undefined)
          .then(() => synchronizeLearningState());
        void noteSyncQueueRef.current.catch((error) => {
          console.warn('同步 AI 修改的阅读笔记失败', error);
        });
      }
      if (job.status === 'queued' || job.status === 'running') {
        setActiveJobId(job.id);
        setStreamingAssistant({
          id: job.assistantMessageId,
          role: 'assistant',
          content: job.dialogueContent?.length ? job.dialogueContent : job.content,
          status: job.status === 'queued' ? 'queued' : 'in_progress',
          createdAt: job.createdAt,
        });
        setStatus('generating');
        setStatusMessage('');
        return;
      }
      setActiveJobId(null);
      if (job.status === 'completed') {
        const store = useLearningStore.getState();
        if (!store.chats.some((message) => message.id === job.assistantMessageId)) {
          store.addChatMessage({
            id: job.assistantMessageId,
            bookId: job.bookId,
            conversationId: job.conversationId,
            role: 'assistant',
            content: job.content,
            dialogueContent: job.dialogueContent,
            createdAt: job.createdAt,
          });
        }
        setStreamingAssistant(null);
        setStatus('ready');
        setStatusMessage('');
        return;
      }
      if (job.status === 'cancelled') {
        setStreamingAssistant(null);
        setStatus('ready');
        setStatusMessage('已停止生成');
        return;
      }
      setStreamingAssistant({
        id: job.assistantMessageId,
        role: 'assistant',
        content: job.dialogueContent?.length ? job.dialogueContent : job.content,
        status: 'failed',
        createdAt: job.createdAt,
      });
      setStatus('error');
      setStatusMessage(job.error || '模型请求失败');
    },
    [
      reportJob,
      lastAppliedJobRef,
      noteSyncQueueRef,
      synchronizedNoteRevisionsRef,
      setActiveJobId,
      setStatus,
      setStatusMessage,
      setStreamingAssistant,
    ],
  );
  const latestTrackedJob = trackedJobs
    .filter((job) => job.conversationId === conversationId)
    .sort((left, right) => right.createdAt - left.createdAt)[0];
  useEffect(() => {
    if (latestTrackedJob) applyJob(latestTrackedJob);
  }, [applyJob, latestTrackedJob]);
  useEffect(() => {
    let disposed = false;
    void listAiJobs(book.id, conversationId)
      .then((jobs) => {
        if (disposed) return;
        jobs
          .filter((job) => job.status === 'completed')
          .sort((left, right) => left.createdAt - right.createdAt)
          .forEach(applyJob);
        const runningJob = jobs.find((job) => job.status === 'queued' || job.status === 'running');
        if (runningJob) applyJob(runningJob);
      })
      .catch((error) => {
        if (!disposed)
          setStatusMessage(error instanceof Error ? error.message : '无法读取服务端任务');
      });
    return () => {
      disposed = true;
    };
  }, [applyJob, book.id, conversationId, setStatusMessage]);
  useEffect(() => {
    if (!activeJobId) return undefined;
    let disposed = false;
    let timer = 0;
    let polling = false;
    let animationFrame = 0;
    let latestStreamedJob: AiJob | undefined;
    const controller = new AbortController();
    const poll = async () => {
      try {
        const job = await getAiJob(activeJobId);
        if (disposed) return;
        applyJob(job);
        if (job.status === 'queued' || job.status === 'running') {
          timer = window.setTimeout(poll, 1_000);
        }
      } catch (error) {
        if (disposed) return;
        setActiveJobId(null);
        setStatus('error');
        setStatusMessage(error instanceof Error ? error.message : '无法读取服务端任务');
      }
    };
    const startPolling = () => {
      if (disposed || polling) return;
      polling = true;
      void poll();
    };
    const applyStreamedJob = (job: AiJob) => {
      latestStreamedJob = job;
      if (animationFrame) return;
      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = 0;
        const latestJob = latestStreamedJob;
        latestStreamedJob = undefined;
        if (!disposed && latestJob) applyJob(latestJob);
      });
    };
    timer = window.setTimeout(startPolling, 1_000);
    void watchAiJob(
      activeJobId,
      (job) => {
        if (!disposed) applyStreamedJob(job);
      },
      controller.signal,
    ).catch((error) => {
      if (disposed || (error instanceof Error && error.name === 'AbortError')) return;
      startPolling();
    });
    return () => {
      disposed = true;
      controller.abort();
      window.clearTimeout(timer);
      window.cancelAnimationFrame(animationFrame);
    };
  }, [activeJobId, applyJob, setActiveJobId, setStatus, setStatusMessage]);
  return applyJob;
}
