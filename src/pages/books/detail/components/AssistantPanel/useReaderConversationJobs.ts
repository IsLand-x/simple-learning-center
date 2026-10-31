import { useCallback, useEffect, useRef } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { aiApi } from '../../../../../api/ai/index';
import type { AiJob, AiJobSummary } from '../../../../../api/ai/type';
import type { AiDialogueContentItem } from '../../../../../../contracts/ai';
import type { BookItem } from '../../../../../../contracts/books';
import { useLearningStore } from '../../../../../store/useLearningStore';
import { watchAiJob } from './watchAiJob';

type ConversationStatus = 'unavailable' | 'ready' | 'generating' | 'error';

interface StreamingAssistantMessage {
  id: string;
  role: 'assistant';
  content: string | AiDialogueContentItem[];
  status: 'queued' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
  createdAt: number;
}

export interface ConversationJobControls {
  activeJobId: string | null;
  setActiveJobId: Dispatch<SetStateAction<string | null>>;
  setStreamingAssistant: Dispatch<SetStateAction<StreamingAssistantMessage | null>>;
  setStatus: Dispatch<SetStateAction<ConversationStatus>>;
  setStatusMessage: Dispatch<SetStateAction<string>>;
}
export function useReaderConversationJobs({
  book,
  conversationId,
  reportJob,
  trackedJobs,
  lastAppliedJobRef,
  activeJobId,
  setActiveJobId,
  setStreamingAssistant,
  setStatus,
  setStatusMessage,
}: ConversationJobControls & {
  book: BookItem;
  conversationId: string;
  reportJob: (job: AiJob) => void;
  trackedJobs: AiJobSummary[];
  lastAppliedJobRef: MutableRefObject<AiJob | undefined>;
}) {
  const currentConversation = useRef(conversationId);
  currentConversation.current = conversationId;
  const applyJob = useCallback(
    (job: AiJob) => {
      reportJob(job);
      if (job.conversationId !== currentConversation.current) return;
      const previous = lastAppliedJobRef.current;
      if (
        previous &&
        (previous.createdAt > job.createdAt ||
          (previous.id === job.id && previous.revision >= job.revision))
      )
        return;
      lastAppliedJobRef.current = job;
      const store = useLearningStore.getState();
      if (
        job.userMessage &&
        !store.chats.some(
          (message) =>
            message.id === job.userMessageId && message.createdAt === job.userMessage!.createdAt,
        )
      )
        store.addChatMessage(job.userMessage);
      if (job.status === 'queued' || job.status === 'running') {
        setActiveJobId(job.id);
        setStreamingAssistant({
          id: job.assistantMessageId,
          role: 'assistant',
          content: job.dialogueContent?.length ? job.dialogueContent : job.content,
          status: job.status === 'queued' ? 'queued' : 'in_progress',
          createdAt: job.assistantCreatedAt ?? job.createdAt,
        });
        setStatus('generating');
        setStatusMessage('');
        return;
      }
      setActiveJobId(null);
      if (job.status === 'completed') {
        if (!store.chats.some((message) => message.id === job.assistantMessageId)) {
          store.addChatMessage({
            id: job.assistantMessageId,
            bookId: job.bookId,
            conversationId: job.conversationId,
            role: 'assistant',
            content: job.content,
            dialogueContent: job.dialogueContent,
            createdAt: job.assistantCreatedAt ?? job.createdAt,
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
        createdAt: job.assistantCreatedAt ?? job.createdAt,
      });
      setStatus('error');
      setStatusMessage(job.error || '模型请求失败');
    },
    [
      reportJob,
      lastAppliedJobRef,
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
    if (
      !latestTrackedJob ||
      (lastAppliedJobRef.current?.id === latestTrackedJob.id &&
        lastAppliedJobRef.current.revision >= latestTrackedJob.revision)
    )
      return;
    let disposed = false;
    void aiApi
      .getJob(latestTrackedJob.id)
      .then((job) => {
        if (!disposed) applyJob(job);
      })
      .catch((error: unknown) => {
        if (!disposed) setStatusMessage(error instanceof Error ? error.message : '读取任务失败');
      });
    return () => {
      disposed = true;
    };
  }, [applyJob, latestTrackedJob, lastAppliedJobRef, setStatusMessage]);
  useEffect(() => {
    let disposed = false;
    void aiApi
      .listJobSummaries({ bookId: book.id, conversationId })
      .then((jobs) => {
        if (disposed) return;
        const latest =
          jobs.find((job) => job.status === 'queued' || job.status === 'running') ?? jobs[0];
        if (latest)
          void aiApi
            .getJob(latest.id)
            .then((job) => {
              if (!disposed) applyJob(job);
            })
            .catch((error: unknown) => {
              if (!disposed)
                setStatusMessage(error instanceof Error ? error.message : '读取任务失败');
            });
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
    return watchAiJob({
      jobId: activeJobId,
      onJob: applyJob,
      onError: (error) => {
        setActiveJobId(null);
        setStatus('error');
        setStatusMessage(error instanceof Error ? error.message : '无法读取服务端任务');
      },
    });
  }, [activeJobId, applyJob, setActiveJobId, setStatus, setStatusMessage]);
  return applyJob;
}
