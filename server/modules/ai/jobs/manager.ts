import type { ChapterVideoJob } from '../../../../contracts/reading.js';
import type { PersistedState } from '../../state/types.js';
import type { AiJob, AiChatRunner } from './types.js';
import { statusError } from '../../../infrastructure/http/errors.js';
import { runServerAiChat } from '../chat.js';
import { createJobExecutor } from './execute.js';
import { createJobStarter } from './start.js';
import { publicJob } from './model.js';
import { createChapterVideoJobJournal } from '../chapterVideos/jobJournal.js';

const JOB_RETENTION_MS = 24 * 60 * 60 * 1_000;
const MAX_RETAINED_JOBS = 100;

export function createAiJobManager({ runChat = runServerAiChat }: { runChat?: AiChatRunner } = {}) {
  const jobs = new Map<string, AiJob>();
  const videoJournal = createChapterVideoJobJournal();
  const subscribers = new Map<string, Set<(job: ReturnType<typeof publicJob>) => void>>();

  async function persistJob(job: AiJob) {
    if (job.purpose !== 'chapter-video') return;
    await videoJournal.record({
      id: job.id,
      bookId: job.bookId,
      chapterId: job.chapterId,
      chapterTitle: job.chapterTitle ?? '全书导读',
      model: job.model,
      status: job.status,
      revision: job.revision,
      content: job.content,
      error: job.error?.slice(0, 4000),
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      completedAt: job.completedAt,
    });
  }

  function publishJob(job: AiJob) {
    void persistJob(job).catch(() => console.error('无法保存视频任务进度'));
    const listeners = subscribers.get(job.id);
    if (!listeners?.size) return;
    const snapshot = publicJob(job);
    for (const listener of [...listeners]) listener(snapshot);
  }

  function subscribe(id: string, listener: (job: ReturnType<typeof publicJob>) => void) {
    const job = jobs.get(id);
    if (!job) throw statusError(404, 'AI 任务不存在或已过期');
    const listeners = subscribers.get(id) ?? new Set();
    listeners.add(listener);
    subscribers.set(id, listeners);
    listener(publicJob(job));
    return () => {
      listeners.delete(listener);
      if (!listeners.size) subscribers.delete(id);
    };
  }

  function pruneJobs() {
    const now = Date.now();
    for (const [id, job] of jobs) {
      if (!['queued', 'running'].includes(job.status) && now - job.updatedAt > JOB_RETENTION_MS) {
        jobs.delete(id);
      }
    }
    if (jobs.size <= MAX_RETAINED_JOBS) return;
    const removable = [...jobs.values()]
      .filter((job) => !['queued', 'running'].includes(job.status))
      .sort((left, right) => left.updatedAt - right.updatedAt);
    for (const job of removable) {
      if (jobs.size <= MAX_RETAINED_JOBS) break;
      jobs.delete(job.id);
    }
  }

  function get(id: string) {
    const job = jobs.get(id);
    if (!job) throw statusError(404, 'AI 任务不存在或已过期');
    return publicJob(job);
  }

  function list({ bookId, conversationId }: { bookId?: string; conversationId?: string } = {}) {
    pruneJobs();
    return [...jobs.values()]
      .filter((job) => !bookId || job.bookId === bookId)
      .filter((job) => !conversationId || job.conversationId === conversationId)
      .sort((left, right) => right.createdAt - left.createdAt)
      .map(publicJob);
  }

  function cancel(id: string) {
    const job = jobs.get(id);
    if (!job) throw statusError(404, 'AI 任务不存在或已过期');
    if (!job.committing && (job.status === 'queued' || job.status === 'running')) {
      job.controller.abort();
      job.status = 'cancelled';
      job.completedAt = Date.now();
      job.updatedAt = job.completedAt;
      job.revision += 1;
      publishJob(job);
    }
    return publicJob(job);
  }

  function protectPersistedState(persistedState: PersistedState) {
    const state = persistedState?.state;
    if (!state) return persistedState;
    const sessions = Array.isArray(state.chatSessions) ? state.chatSessions : [];
    const chats = Array.isArray(state.chats) ? state.chats : [];
    for (const job of jobs.values()) {
      if (
        job.purpose === 'glossary' ||
        job.purpose === 'mindmap' ||
        job.purpose === 'chapter-video'
      )
        continue;
      const hasSession = sessions.some((session) => session.id === job.conversationId);
      if (!hasSession) continue;
      if (!chats.some((message) => message.id === job.userMessage.id)) {
        chats.push(structuredClone(job.userMessage));
      }
      if (job.finalResult && !chats.some((message) => message.id === job.assistantMessageId)) {
        chats.push({
          id: job.assistantMessageId,
          bookId: job.bookId,
          conversationId: job.conversationId,
          role: 'assistant',
          content: job.finalResult!.content,
          dialogueContent: structuredClone(job.finalResult!.dialogueContent),
          createdAt: job.assistantCreatedAt,
        });
      }
    }
    state.chatSessions = sessions;
    state.chats = chats;
    return persistedState;
  }

  const executeJob = createJobExecutor({ runChat, publishJob, pruneJobs });
  const start = createJobStarter({ jobs, pruneJobs, executeJob, persistJob });
  return {
    start,
    get,
    list,
    cancel,
    subscribe,
    protectPersistedState,
    async listVideoJobs(bookId: string) {
      const persisted = await videoJournal.list(bookId);
      const activeVideoJobs = [...jobs.values()]
        .filter(
          (job) =>
            job.purpose === 'chapter-video' &&
            job.bookId === bookId &&
            ['queued', 'running'].includes(job.status),
        )
        .map((job): ChapterVideoJob => ({
          id: job.id,
          bookId: job.bookId,
          chapterId: job.chapterId,
          chapterTitle: job.chapterTitle ?? '全书导读',
          model: job.model,
          status: job.status as ChapterVideoJob['status'],
          revision: job.revision,
          content: job.content,
          error: job.error,
          createdAt: job.createdAt,
          updatedAt: job.updatedAt,
          completedAt: job.completedAt,
        }));
      if (!activeVideoJobs.length) return persisted;
      const activeIds = new Set(activeVideoJobs.map((j) => j.id));
      return [...activeVideoJobs, ...persisted.filter((j) => !activeIds.has(j.id))].sort(
        (left, right) => right.createdAt - left.createdAt,
      );
    },
    async deleteVideoJob(bookId: string, jobId: string) {
      await videoJournal.remove(bookId, jobId);
      const job = jobs.get(jobId);
      if (job?.bookId === bookId && job.purpose === 'chapter-video') jobs.delete(jobId);
    },
  };
}
