import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { aiApi } from '../../../../../api/ai/index';
import type { AiJob } from '../../../../../api/ai/type';

import { useLearningStore } from '../../../../../store/useLearningStore';
import { resolveReaderAiActivity } from './activity';
import { ReaderAiActivityContext } from './useReaderAiActivity';

export function ReaderAiActivityProvider({
  bookId,
  children,
}: {
  bookId: string;
  children: ReactNode;
}) {
  const chats = useLearningStore((state) => state.chats);
  const sessions = useLearningStore((state) => state.chatSessions);
  const [jobs, setJobs] = useState<AiJob[]>([]);
  const jobsRef = useRef(jobs);
  jobsRef.current = jobs;
  const [startingConversations, setStartingConversations] = useState<string[]>([]);
  const setStarting = useCallback((conversationId: string, starting: boolean) => {
    setStartingConversations((previous) =>
      starting
        ? [...previous.filter((id) => id !== conversationId), conversationId]
        : previous.filter((id) => id !== conversationId),
    );
  }, []);
  const reportJob = useCallback(
    (job: AiJob) => {
      if (job.bookId !== bookId) return;
      setJobs((previous) => {
        const existing = previous.find((item) => item.id === job.id);
        if (existing && existing.revision >= job.revision) return previous;
        return [...previous.filter((item) => item.id !== job.id), job];
      });
      const store = useLearningStore.getState();
      if (
        job.status === 'completed' &&
        store.chatSessions.some((session) => session.id === job.conversationId) &&
        !store.chats.some((message) => message.id === job.assistantMessageId)
      ) {
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
    },
    [bookId],
  );

  useEffect(() => {
    let disposed = false;
    let timer = 0;
    const poll = async () => {
      const previousJobs = jobsRef.current;
      try {
        const next = await aiApi.listJobs({ bookId: bookId });
        if (!disposed) {
          next.forEach(reportJob);
          const ids = new Set(next.map((job) => job.id));
          setJobs((previous) =>
            previous.filter((job) => ids.has(job.id) || !previousJobs.includes(job)),
          );
        }
      } catch {
        // Keep the last known state through temporary network failures and retry.
      } finally {
        if (!disposed) timer = window.setTimeout(poll, 2_000);
      }
    };
    void poll();
    return () => {
      disposed = true;
      window.clearTimeout(timer);
    };
  }, [bookId, reportJob]);

  const value = useMemo(
    () => ({
      jobs,
      startingConversations,
      setStarting,
      ...resolveReaderAiActivity(
        bookId,
        jobs.filter((job) => sessions.some((session) => session.id === job.conversationId)),
        chats,
      ),
      ...(startingConversations[0]
        ? { status: 'running' as const, conversationId: startingConversations[0] }
        : {}),
      reportJob,
    }),
    [bookId, chats, jobs, reportJob, sessions, setStarting, startingConversations],
  );
  return (
    <ReaderAiActivityContext.Provider value={value}>{children}</ReaderAiActivityContext.Provider>
  );
}
