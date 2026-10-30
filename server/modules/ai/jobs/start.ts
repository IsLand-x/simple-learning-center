import { randomUUID } from 'node:crypto';
import { findMindMapChapter } from '../mindmaps/model.js';
import type { AiJob, AiChatContext } from './types.js';
import { mutatePersistedState } from '../../state/stateStore.js';
import { publicJob } from './model.js';
import { normalizeJobInput } from './startInput.js';
import { prepareJobResources } from './startResources.js';
import { prepareJobConversation, registerJobConversation } from './startConversation.js';
import { createJobContext } from './startContext.js';

interface StartDependencies {
  jobs: Map<string, AiJob>;
  pruneJobs: () => void;
  executeJob: (job: AiJob, context: AiChatContext) => Promise<void>;
  persistJob: (job: AiJob) => Promise<void>;
}

export function createJobStarter({ jobs, pruneJobs, executeJob, persistJob }: StartDependencies) {
  async function start(rawInput: unknown) {
    pruneJobs();
    const input = normalizeJobInput(rawInput);
    const { bookId, model, reasoningEffort, purpose, conversationId, userMessageId } = input;
    const resources = await prepareJobResources(input, jobs);
    const { book, chapterId, termId, term } = resources;
    const conversation = prepareJobConversation(input);
    const { userMessage, session } = conversation;
    const timestamp = Date.now();
    await mutatePersistedState(
      (nextPersistedState) => {
        registerJobConversation(nextPersistedState, jobs, input, chapterId, conversation);
      },
      { preserveResourceFiles: true },
    );

    const job: AiJob = {
      id: randomUUID(),
      bookId,
      resourceType: 'book',
      model,
      reasoningEffort,
      purpose,
      termId,
      chapterId,
      chapterTitle:
        purpose === 'chapter-video'
          ? chapterId
            ? findMindMapChapter(book.toc, chapterId)?.label
            : '全书导读'
          : undefined,
      termUpdatedAt: term?.updatedAt ?? term?.createdAt,
      conversationId,
      userMessageId,
      assistantMessageId: randomUUID(),
      assistantCreatedAt: Math.max(timestamp, userMessage.createdAt + 1),
      status: 'queued',
      revision: 0,
      content: '',
      dialogueContent: [],
      notesRevision: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
      completedAt: undefined,
      error: undefined,
      controller: new AbortController(),
      userMessage: structuredClone(userMessage),
      session: structuredClone(session),
      finalResult: undefined,
    };
    jobs.set(job.id, job);
    try {
      await persistJob(job);
    } catch (error) {
      jobs.delete(job.id);
      throw error;
    }
    const context = createJobContext(input, resources, userMessage);
    queueMicrotask(() => void executeJob(job, context));
    return publicJob(job);
  }
  return start;
}
