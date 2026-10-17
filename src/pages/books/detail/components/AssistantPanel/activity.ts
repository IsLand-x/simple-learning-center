import type { AiJobSummary } from '../../../../../api/ai/type';

import type { ChatMessage, ChatSessionSummary } from '../../../../../../contracts/ai';

export type ReaderAiActivity = 'idle' | 'running' | 'unread';

export function resolveReaderAiActivity(
  bookId: string,
  jobs: AiJobSummary[],
  chats: ChatMessage[],
  summaries: ChatSessionSummary[] = [],
) {
  const running = jobs.find(
    (job) => job.bookId === bookId && (job.status === 'queued' || job.status === 'running'),
  );
  if (running) return { status: 'running' as const, conversationId: running.conversationId };
  const unreadSession = summaries.find(
    (session) => session.bookId === bookId && session.unreadCount > 0,
  );
  if (unreadSession) return { status: 'unread' as const, conversationId: unreadSession.id };
  const unread = chats.find(
    (message) => message.bookId === bookId && message.role === 'assistant' && !message.readAt,
  );
  return unread
    ? { status: 'unread' as const, conversationId: unread.conversationId }
    : { status: 'idle' as const, conversationId: undefined };
}

export function readerAiActivityLabel(status: ReaderAiActivity) {
  return status === 'running'
    ? 'AI 正在运行'
    : status === 'unread'
      ? 'AI 有未读回复，点击阅读'
      : '';
}
