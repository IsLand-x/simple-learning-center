import type { ChatMessage } from '../../../contracts/domain.js';
import type { AiJob, AiResult } from './types.js';
import { mutatePersistedState } from '../state/repository.js';
import { upsertDigestRun } from './jobModel.js';

export async function persistAssistant(job: AiJob, result: AiResult) {
  await mutatePersistedState((persistedState) => {
    const state = persistedState.state;
    const sessions = Array.isArray(state.chatSessions) ? state.chatSessions : [];
    if (!sessions.some((session) => session.id === job.conversationId)) return;
    const message: ChatMessage = {
      id: job.assistantMessageId,
      bookId: job.bookId,
      conversationId: job.conversationId,
      role: 'assistant',
      content: result.content,
      dialogueContent: result.dialogueContent,
      createdAt: job.assistantCreatedAt,
    };
    const chats = Array.isArray(state.chats) ? state.chats : [];
    state.chats = [...chats.filter((item) => item.id !== message.id), message];
    state.chatSessions = sessions.map((session) =>
      session.id === job.conversationId
        ? { ...session, updatedAt: Math.max(session.updatedAt, message.createdAt) }
        : session,
    );
    if (job.resourceType === 'rss' && job.purpose === 'summary') {
      const rssItems = Array.isArray(state.rssItems) ? state.rssItems : [];
      state.rssItems = rssItems.map((item) =>
        item.id === job.rssItemId
          ? {
              ...item,
              aiSummary: result.content,
              aiSummaryUpdatedAt: job.assistantCreatedAt,
              aiSummaryVersion: 2,
            }
          : item,
      );
    }
    if (job.resourceType === 'rss' && job.purpose === 'translation') {
      const rssItems = Array.isArray(state.rssItems) ? state.rssItems : [];
      state.rssItems = rssItems.map((item) =>
        item.id === job.rssItemId
          ? {
              ...item,
              aiTranslation: result.content,
              aiTranslationHtml: result.translationHtml,
              aiTranslationUpdatedAt: job.assistantCreatedAt,
              aiTranslationSourceFetchedAt: Number(
                item.fullContentFetchedAt || item.fetchedAt || 0,
              ),
            }
          : item,
      );
    }
    if (job.resourceType === 'rssDigest' && job.purpose === 'digest') {
      const completedAt = Date.now();
      const digests = Array.isArray(state.rssDailyDigests) ? state.rssDailyDigests : [];
      const feedIds = [...new Set(job.digestItems.map((item) => item.feedId))];
      const previous = digests.find((digest) => digest.date === job.digestDate!);
      const digest = {
        id: `rss-digest:${job.digestDate}`,
        date: job.digestDate!,
        content: result.content,
        sourceItemIds: job.digestItems.map((item) => item.id),
        sourceFeedIds: feedIds,
        itemCount: job.digestItems.length,
        model: job.model,
        generatedAt: previous?.generatedAt || job.assistantCreatedAt,
        updatedAt: job.assistantCreatedAt,
      };
      state.rssDailyDigests = [digest, ...digests.filter((item) => item.id !== digest.id)].sort(
        (left, right) => right.date.localeCompare(left.date),
      );
      state.rssDigestSettings = {
        ...(state.rssDigestSettings || {}),
        lastCompletedAt: completedAt,
        lastError: undefined,
      };
      const runs = Array.isArray(state.rssDigestRuns) ? state.rssDigestRuns : [];
      const digestRun = runs.find((run) => run.id === job.digestRunId);
      if (digestRun) {
        upsertDigestRun(state, {
          ...digestRun,
          status: 'completed',
          completedAt,
          updatedAt: completedAt,
          message: undefined,
        });
      }
    }
  });
}
