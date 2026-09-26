import { aiApi } from '../../api/ai';
import type { AiJob } from '../../api/ai/type';
import { useCallback, useEffect } from 'react';

import { useLearningStore } from '../../store/useLearningStore';
import type { ConversationJobControls } from '../../types/conversation';

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
      setStreamingAssistant((message) => ({
        id: message?.id ?? job.assistantMessageId,
        role: 'assistant',
        content: job.dialogueContent?.length ? job.dialogueContent : job.content,
        status: 'failed',
        createdAt: message?.createdAt ?? job.createdAt,
      }));
      setStatus('error');
      setStatusMessage(job.error || '模型请求失败');
    },
    [setActiveJobId, setStatus, setStatusMessage, setStreamingAssistant],
  );
  useEffect(() => {
    let disposed = false;
    void aiApi
      .listJobs({ bookId: resourceId, conversationId: conversationId })
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
  }, [applyJob, conversationId, resourceId, setStatusMessage]);
  useEffect(() => {
    if (!activeJobId) return undefined;
    let disposed = false;
    let timer = 0;
    let polling = false;
    const controller = new AbortController();
    const poll = async () => {
      try {
        const job = await aiApi.getJob(activeJobId);
        if (disposed) return;
        applyJob(job);
        if (job.status === 'queued' || job.status === 'running')
          timer = window.setTimeout(poll, 1_000);
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
    timer = window.setTimeout(startPolling, 1_000);
    void aiApi
      .watchJob(
        activeJobId,
        (job) => {
          if (!disposed) applyJob(job);
        },
        controller.signal,
      )
      .catch((error) => {
        if (disposed || (error instanceof Error && error.name === 'AbortError')) return;
        startPolling();
      });
    return () => {
      disposed = true;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [activeJobId, applyJob, setActiveJobId, setStatus, setStatusMessage]);
  return applyJob;
}
