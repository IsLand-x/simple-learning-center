import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { useReaderNoteSync } from './useReaderNoteSync';
import { aiApi } from '../../../../../api/ai/index';
import type { AiJobSummary } from '../../../../../api/ai/type';

import { useLearningStore } from '../../../../../store/useLearningStore';
import { resolveReaderAiActivity } from './activity';
import { ReaderAiActivityContext } from './useReaderAiActivity';
import { useConversationSummaries } from '../../../../../components/ai/useConversationSummaries';
import { useReaderJobPolling } from './useReaderJobPolling';

export function ReaderAiActivityProvider({
  bookId,
  children,
}: {
  bookId: string;
  children: ReactNode;
}) {
  useConversationSummaries(bookId);
  const synchronizeJobNotes = useReaderNoteSync(bookId);
  const chats = useLearningStore((state) => state.chats);
  const summaries = useLearningStore((state) => state.conversationSummaries);
  const loadSummaries = useLearningStore((state) => state.loadConversationSummaries);
  const sessions = useLearningStore((state) => state.chatSessions);
  const [jobs, setJobs] = useState<AiJobSummary[]>([]);
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
    (job: AiJobSummary) => {
      if (job.bookId !== bookId) return;
      synchronizeJobNotes(job);
      setJobs((previous) => {
        const existing = previous.find((item) => item.id === job.id);
        if (existing && existing.revision >= job.revision) return previous;
        return [...previous.filter((item) => item.id !== job.id), job];
      });
      const previous = jobsRef.current.find((item) => item.id === job.id);
      if (!previous || (job.status === 'completed' && previous.revision !== job.revision)) {
        void loadSummaries(bookId).catch(() => undefined);
      }
    },
    [bookId, loadSummaries, synchronizeJobNotes],
  );

  const refreshJobs = useCallback(
    async (signal: AbortSignal) => {
      const previousJobs = jobsRef.current;
      const next = await aiApi.listJobSummaries({ bookId }, signal);
      if (signal.aborted) return;
      next.forEach(reportJob);
      const ids = new Set(next.map((job) => job.id));
      setJobs((previous) => {
        const visible = previous.filter((job) => ids.has(job.id) || !previousJobs.includes(job));
        return visible.length === previous.length ? previous : visible;
      });
    },
    [bookId, reportJob],
  );
  useReaderJobPolling(
    refreshJobs,
    startingConversations.length > 0 ||
      jobs.some((job) => job.status === 'queued' || job.status === 'running'),
  );

  const value = useMemo(
    () => ({
      jobs,
      startingConversations,
      setStarting,
      ...resolveReaderAiActivity(
        bookId,
        jobs.filter((job) => sessions.some((session) => session.id === job.conversationId)),
        chats,
        summaries,
      ),
      ...(startingConversations[0]
        ? { status: 'running' as const, conversationId: startingConversations[0] }
        : {}),
      reportJob,
    }),
    [bookId, chats, jobs, reportJob, sessions, setStarting, startingConversations, summaries],
  );
  return (
    <ReaderAiActivityContext.Provider value={value}>{children}</ReaderAiActivityContext.Provider>
  );
}
