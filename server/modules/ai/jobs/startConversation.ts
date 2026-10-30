import type { ChatMessage, ChatSession } from '../../../../contracts/ai.js';
import type { PersistedState } from '../../state/types.js';
import type { AiJob } from './types.js';
import type { NormalizedJobInput } from './startInput.js';
import { statusError } from '../../../infrastructure/http/errors.js';
import { optionalString, makeConversationTitle } from './model.js';

export function prepareJobConversation(input: NormalizedJobInput) {
  const {
    request,
    userMessageId,
    bookId,
    conversationId,
    content,
    quote,
    createdAt,
    configId,
    model,
    reasoningEffort,
  } = input;
  const userMessage: ChatMessage = {
    id: userMessageId,
    bookId,
    conversationId,
    role: 'user',
    content,
    ...(quote ? { quote } : {}),
    createdAt,
  };
  const provider = `api:${configId}` as const;
  const sessionInput = request?.session;
  const sessionCreatedAt = Number.isFinite(sessionInput?.createdAt)
    ? sessionInput!.createdAt!
    : createdAt;
  const session: ChatSession = {
    id: conversationId,
    bookId,
    title: optionalString(sessionInput?.title, 100).trim() || makeConversationTitle(content),
    provider,
    model,
    reasoningEffort: reasoningEffort || 'auto',
    createdAt: sessionCreatedAt,
    updatedAt: createdAt,
  };
  return { userMessage, session };
}

type JobConversation = ReturnType<typeof prepareJobConversation>;

// Called only inside the shared state write queue; keep checks and ordering together.
export function registerJobConversation(
  nextPersistedState: PersistedState,
  jobs: Map<string, AiJob>,
  input: NormalizedJobInput,
  chapterId: string | undefined,
  { userMessage, session }: JobConversation,
) {
  const { bookId, conversationId, purpose, model, reasoningEffort, userMessageId } = input;
  const provider = session.provider;
  if (nextPersistedState.deletedConversationIds?.includes(conversationId))
    throw statusError(404, '对话已删除，请开启新对话');
  const next = nextPersistedState.state;
  if (
    (chapterId || purpose === 'chapter-video') &&
    [...jobs.values()].some(
      (job) =>
        job.bookId === bookId &&
        job.chapterId === chapterId &&
        job.purpose === purpose &&
        ['queued', 'running'].includes(job.status),
    )
  )
    throw statusError(
      409,
      purpose === 'chapter-video' ? '所选范围正在生成视频' : '该章节正在生成思维导图',
    );
  if (
    purpose === 'chapter-video' &&
    [...jobs.values()].filter(
      (job) => job.purpose === 'chapter-video' && ['queued', 'running'].includes(job.status),
    ).length >= 2
  )
    throw statusError(409, '已有两个视频任务，请等待完成后再生成');
  if (purpose !== 'glossary' && purpose !== 'mindmap' && purpose !== 'chapter-video') {
    // Assign message order inside the write queue, using one clock for both roles.
    // Client clocks may be ahead, behind, or change between consecutive turns.
    const chats = Array.isArray(next.chats) ? next.chats : [];
    const createdAt = chats.reduce(
      (latest, message) =>
        message.bookId === bookId && message.conversationId === conversationId
          ? Math.max(latest, message.createdAt + 1)
          : latest,
      Date.now(),
    );
    userMessage.createdAt = createdAt;
    session.createdAt = createdAt;
    session.updatedAt = createdAt;
    const sessions = Array.isArray(next.chatSessions) ? next.chatSessions : [];
    const existingSession = sessions.find((item) => item.id === conversationId);
    next.chatSessions = [
      existingSession
        ? {
            ...existingSession,
            provider,
            model,
            reasoningEffort: reasoningEffort || 'auto',
            updatedAt: Math.max(existingSession.updatedAt, createdAt),
          }
        : session,
      ...sessions.filter((item) => item.id !== conversationId),
    ];
    next.chats = [...chats.filter((item) => item.id !== userMessageId), userMessage];
  }
}
