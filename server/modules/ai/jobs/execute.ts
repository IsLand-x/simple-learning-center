import type { RssDigestRun } from '../../../../contracts/rss.js';
import type { AiJob, AiChatContext, AiChatRunner } from './types.js';
import { mutatePersistedState } from '../../state/stateStore.js';
import { completeRssTranslation } from '../../rss/translation.js';
import { persistAssistant } from './persistence.js';
import {
  isCancelled,
  safeErrorMessage,
  translatedDialogueContent,
  upsertDigestRun,
} from './model.js';

interface ExecutionDependencies {
  runChat: AiChatRunner;
  publishJob: (job: AiJob) => void;
  pruneJobs: () => void;
  updateDigestRun: (runId: string | undefined, changes: Partial<RssDigestRun>) => Promise<void>;
}

export function createJobExecutor({
  runChat,
  publishJob,
  pruneJobs,
  updateDigestRun,
}: ExecutionDependencies) {
  async function executeJob(job: AiJob, context: AiChatContext) {
    if (isCancelled(job)) return;
    job.status = 'running';
    job.updatedAt = Date.now();
    job.revision += 1;
    publishJob(job);
    try {
      if (job.resourceType === 'rssDigest') {
        await updateDigestRun(job.digestRunId, { status: 'running' });
      }
      const rawResult = await runChat({
        ...context,
        signal: job.controller.signal,
        onProgress(progress) {
          if (isCancelled(job)) return;
          job.content = progress.content;
          job.dialogueContent = structuredClone(progress.dialogueContent);
          job.updatedAt = Date.now();
          job.revision += 1;
          publishJob(job);
        },
        onNoteChange() {
          job.notesRevision += 1;
          job.updatedAt = Date.now();
          job.revision += 1;
          publishJob(job);
        },
      });
      if (job.controller.signal.aborted || isCancelled(job)) return;
      const result =
        job.resourceType === 'rss' && job.purpose === 'translation'
          ? (() => {
              const translation = completeRssTranslation(
                rawResult.content,
                context.translationSource!,
              );
              return {
                ...rawResult,
                content: translation.text,
                dialogueContent: translatedDialogueContent(
                  rawResult.dialogueContent,
                  translation.text,
                ),
                translationHtml: translation.html,
              };
            })()
          : rawResult;
      job.finalResult = structuredClone(result);
      await persistAssistant(job, result);
      job.content = result.content;
      job.translationHtml = result.translationHtml;
      job.dialogueContent = structuredClone(result.dialogueContent);
      job.status = 'completed';
      job.completedAt = Date.now();
      job.updatedAt = job.completedAt;
      job.revision += 1;
      publishJob(job);
    } catch (error) {
      if (
        job.controller.signal.aborted ||
        isCancelled(job) ||
        (error as { name?: unknown } | null)?.name === 'AbortError'
      ) {
        job.status = 'cancelled';
        job.error = undefined;
      } else {
        job.status = 'failed';
        job.error = safeErrorMessage(error, [
          context.config.apiKey,
          context.webSearchConfig.apiKey,
        ]);
        console.error(`AI task ${job.id} failed`);
      }
      job.completedAt = Date.now();
      job.updatedAt = job.completedAt;
      if (job.resourceType === 'rssDigest') {
        await mutatePersistedState((persistedState) => {
          if (job.status === 'failed') {
            persistedState.state.rssDigestSettings = {
              ...(persistedState.state.rssDigestSettings || {}),
              lastError: job.error,
            };
          }
          const runs = Array.isArray(persistedState.state.rssDigestRuns)
            ? persistedState.state.rssDigestRuns
            : [];
          const digestRun = runs.find((run) => run.id === job.digestRunId);
          if (digestRun) {
            upsertDigestRun(persistedState.state, {
              ...digestRun,
              status: job.status,
              completedAt: job.completedAt,
              updatedAt: job.completedAt!,
              message: job.error,
            });
          }
        }).catch(() => undefined);
      }
      job.revision += 1;
      publishJob(job);
    } finally {
      pruneJobs();
    }
  }
  return executeJob;
}
