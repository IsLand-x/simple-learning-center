import { aiApi } from '../../api/ai';
import type { AiJob } from '../../api/ai/type';
import { useCallback, useEffect } from 'react';

import { useLearningStore } from '../../store/useLearningStore';
import type { ConversationJobControls } from '../../types/conversation';
import { watchAiJob } from '../../util/ai/watchAiJob';

export function useContentConversationJobs({
  resourceId,
  conversationId,
  activeJobId,
  setActiveJobId,
  setStreamingAssistant,
  setStatus,
  setStatusMessage,
}: ConversationJobControls & { resourceId: string; conversationId: string }) {
  const applyJob = useCallback(
    (job: AiJob) => {
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
      setStreamingAssistant((message) => ({
        id: message?.id ?? job.assistantMessageId,
        role: 'assistant',
        content: job.dialogueContent?.length ? job.dialogueContent : job.content,
        status: 'failed',
        createdAt: job.assistantCreatedAt ?? message?.createdAt ?? job.createdAt,
      }));
      setStatus('error');
      setStatusMessage(job.error || '模型请求失败');
    },
    [setActiveJobId, setStatus, setStatusMessage, setStreamingAssistant],
  );
  useEffect(() => {
    let disposed = false;
    void aiApi
      .listJobSummaries({ bookId: resourceId, conversationId })
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
  }, [applyJob, conversationId, resourceId, setStatusMessage]);
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
