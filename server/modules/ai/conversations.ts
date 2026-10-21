import { createHash } from 'node:crypto';
import type { ChatSession, ChatSessionSummary } from '../../../contracts/ai.js';
import type { StoredState } from '../state/types.js';
import { readStateProjection, mutatePersistedState } from '../state/stateStore.js';
import { statusError } from '../../infrastructure/http/errors.js';

const summaryCache = new WeakMap<StoredState, ChatSessionSummary[]>();

function summaries(state: StoredState) {
  const cached = summaryCache.get(state);
  if (cached) return cached;
  const counts = new Map<string, { messageCount: number; unreadCount: number }>();
  for (const message of state.chats ?? []) {
    const count = counts.get(message.conversationId) ?? { messageCount: 0, unreadCount: 0 };
    count.messageCount++;
    if (message.role === 'assistant' && !message.readAt) count.unreadCount++;
    counts.set(message.conversationId, count);
  }
  const result = (state.chatSessions ?? [])
    .map((session) => ({
      ...session,
      ...(counts.get(session.id) ?? { messageCount: 0, unreadCount: 0 }),
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id));
  summaryCache.set(state, result);
  return result;
}

function pageAfter<T>(
  items: T[],
  cursor: string | undefined,
  key: (item: T) => string,
  limit: number,
) {
  const offset = cursor ? items.findIndex((item) => key(item) === cursor) + 1 : 0;
  if (cursor && !offset) throw statusError(400, '分页位置已失效，请重新加载');
  const page = items.slice(offset, offset + limit);
  return { page, nextCursor: offset + limit < items.length ? key(page[page.length - 1]) : null };
}

export function listConversations(bookId: string, cursor: string | undefined, limit: number) {
  return readStateProjection((state) => {
    const items = summaries(state).filter((session) => session.bookId === bookId);
    const { page, nextCursor } = pageAfter(items, cursor, (session) => session.id, limit);
    return { sessions: page, nextCursor };
  });
}

export function conversationMessages(
  bookId: string,
  id: string,
  before: string | undefined,
  limit: number,
) {
  return readStateProjection((state) => {
    const session =
      state.chatSessions?.find((item) => item.id === id && item.bookId === bookId) ?? null;
    const items = (state.chats ?? [])
      .filter((message) => message.conversationId === id && message.bookId === bookId)
      .sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id));
    const { page, nextCursor } = pageAfter(items, before, (message) => message.id, limit);
    return { session, messages: page.reverse(), nextCursor };
  });
}

function requireSession(state: StoredState, id: string) {
  const session = state.chatSessions?.find((item) => item.id === id);
  if (!session) throw statusError(404, '对话不存在或已删除');
  return session;
}

export function changeConversation(
  id: string,
  changes: Partial<Pick<ChatSession, 'provider' | 'model' | 'reasoningEffort'>>,
) {
  return mutatePersistedState(({ state }) => {
    Object.assign(requireSession(state, id), changes);
  });
}

export function markConversationRead(id: string, messageIds: string[]) {
  return mutatePersistedState(({ state }) => {
    requireSession(state, id);
    const ids = new Set(messageIds);
    const readAt = Date.now();
    state.chats = (state.chats ?? []).map((message) =>
      message.conversationId === id &&
      ids.has(message.id) &&
      message.role === 'assistant' &&
      !message.readAt
        ? { ...message, readAt }
        : message,
    );
  });
}

export function deleteConversation(id: string) {
  return mutatePersistedState((snapshot) => {
    const { state } = snapshot;
    snapshot.deletedConversationIds = [
      ...new Set([...(snapshot.deletedConversationIds ?? []), id]),
    ];
    state.conversationDrafts = (state.conversationDrafts ?? []).filter(
      (draft) => draft.conversationId !== id,
    );
    state.chatSessions = (state.chatSessions ?? []).filter((session) => session.id !== id);
    state.chats = (state.chats ?? []).filter((message) => message.conversationId !== id);
  });
}

export function conversationResponse(value: unknown) {
  const body = JSON.stringify(value);
  return { body, etag: `"${createHash('sha256').update(body).digest('base64url')}"` };
}
