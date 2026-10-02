import type { RssDigestRun } from '../../../../contracts/rss.js';
import type { PersistedState } from '../../state/types.js';
import type { AiJob, AiChatRunner } from './types.js';
import { statusError } from '../../../infrastructure/http/errors.js';
import { mutatePersistedState } from '../../state/stateStore.js';
import { runServerAiChat } from '../chat.js';
import { createDigestStarter } from '../digest.js';
import { createJobExecutor } from './execute.js';
import { createJobStarter } from './start.js';
import { publicJob, upsertDigestRun } from './model.js';

const JOB_RETENTION_MS = 24 * 60 * 60 * 1_000;
const MAX_RETAINED_JOBS = 100;

export function createAiJobManager({ runChat = runServerAiChat }: { runChat?: AiChatRunner } = {}) {
  const jobs = new Map<string, AiJob>();
  const subscribers = new Map<string, Set<(job: ReturnType<typeof publicJob>) => void>>();

  async function updateDigestRun(runId: string | undefined, changes: Partial<RssDigestRun>) {
    if (!runId) return;
    await mutatePersistedState((persistedState) => {
      const runs = Array.isArray(persistedState.state.rssDigestRuns)
        ? persistedState.state.rssDigestRuns
        : [];
      const current = runs.find((run) => run.id === runId);
      if (!current) return;
      upsertDigestRun(persistedState.state, {
        ...current,
        ...changes,
        updatedAt: Number.isFinite(changes.updatedAt)
          ? (changes.updatedAt ?? Date.now())
          : Date.now(),
      });
    });
  }

  function publishJob(job: AiJob) {
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
    if (job.status === 'queued' || job.status === 'running') {
      job.controller.abort();
      job.status = 'cancelled';
      job.completedAt = Date.now();
      job.updatedAt = job.completedAt;
      if (job.resourceType === 'rssDigest') {
        void updateDigestRun(job.digestRunId, {
          status: 'cancelled',
          completedAt: job.completedAt,
          message: '任务已取消',
        }).catch(() => undefined);
      }
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
    let rssItems = Array.isArray(state.rssItems) ? state.rssItems : [];
    let rssDailyDigests = Array.isArray(state.rssDailyDigests) ? state.rssDailyDigests : [];
    for (const job of jobs.values()) {
      const hasSession = sessions.some((session) => session.id === job.conversationId);
      const resumableRssTask =
        job.resourceType === 'rss' &&
        (job.purpose === 'summary' || job.purpose === 'translation') &&
        rssItems.some((item) => item.id === job.rssItemId);
      const resumableDigest = job.resourceType === 'rssDigest' && job.purpose === 'digest';
      if (!hasSession && !resumableRssTask && !resumableDigest) continue;
      if (!hasSession) sessions.push(structuredClone(job.session));
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
      if (job.resourceType === 'rss' && job.purpose === 'summary' && job.finalResult) {
        rssItems = rssItems.map((item) =>
          item.id === job.rssItemId
            ? {
                ...item,
                aiSummary: job.finalResult!.content,
                aiSummaryUpdatedAt: job.assistantCreatedAt,
                aiSummaryVersion: 2,
              }
            : item,
        );
      }
      if (job.resourceType === 'rss' && job.purpose === 'translation' && job.finalResult) {
        rssItems = rssItems.map((item) =>
          item.id === job.rssItemId
            ? {
                ...item,
                aiTranslation: job.finalResult!.content,
                aiTranslationHtml: job.finalResult!.translationHtml,
                aiTranslationUpdatedAt: job.assistantCreatedAt,
                aiTranslationSourceFetchedAt: Number(
                  item.fullContentFetchedAt || item.fetchedAt || 0,
                ),
              }
            : item,
        );
      }
      if (job.resourceType === 'rssDigest' && job.purpose === 'digest' && job.finalResult) {
        const previous = rssDailyDigests.find((digest) => digest.date === job.digestDate!);
        const digest = {
          id: `rss-digest:${job.digestDate}`,
          date: job.digestDate!,
          content: job.finalResult!.content,
          sourceItemIds: job.digestItems.map((item) => item.id),
          sourceFeedIds: [...new Set(job.digestItems.map((item) => item.feedId))],
          itemCount: job.digestItems.length,
          model: job.model,
          generatedAt: previous?.generatedAt || job.assistantCreatedAt,
          updatedAt: job.assistantCreatedAt,
        };
        rssDailyDigests = [digest, ...rssDailyDigests.filter((item) => item.id !== digest.id)].sort(
          (left, right) => right.date.localeCompare(left.date),
        );
      }
    }
    state.chatSessions = sessions;
    state.chats = chats;
    state.rssItems = rssItems;
    state.rssDailyDigests = rssDailyDigests;
    return persistedState;
  }

  const executeJob = createJobExecutor({ runChat, publishJob, pruneJobs, updateDigestRun });
  const start = createJobStarter({ jobs, pruneJobs, executeJob });
  const startDigest = createDigestStarter({ jobs, start });
  return { start, startDigest, get, list, cancel, subscribe, protectPersistedState };
}
