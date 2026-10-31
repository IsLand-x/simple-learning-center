import { conversationsApi } from '../../api/conversations';
import type { ChatMessage, ChatSessionSummary } from '../../../contracts/ai';
import type { LearningState, LearningStoreSet } from '../learningState';

type ConversationActions = Pick<
  LearningState,
  | 'setConversationDraft'
  | 'markChatMessagesRead'
  | 'createChatSession'
  | 'updateChatSession'
  | 'deleteChatSession'
  | 'addChatMessage'
  | 'loadConversationSummaries'
  | 'loadConversationMessages'
>;

function mergeMessages(current: ChatMessage[], incoming: ChatMessage[]) {
  const messages = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) {
    const readAt = Math.max(messages.get(message.id)?.readAt ?? 0, message.readAt ?? 0);
    messages.set(message.id, { ...message, ...(readAt ? { readAt } : {}) });
  }
  return [...messages.values()].sort(
    (a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id),
  );
}

export function createConversationActions(
  set: LearningStoreSet,
  get: () => LearningState,
): ConversationActions {
  const summaryRequests = new Map<string, Promise<void>>();
  const reading = new Set<string>();
  const deleted = new Set<string>();
  const localSessions = new Set<string>();
  let revision = 0;
  return {
    setConversationDraft: (resourceId, conversationId, text) => {
      const current = get().conversationDrafts.find(
        (draft) => draft.resourceId === resourceId && draft.conversationId === conversationId,
      );
      if ((current?.text ?? '') === text) return;
      set((state) => ({
        conversationDrafts: [
          ...state.conversationDrafts.filter(
            (draft) => draft.resourceId !== resourceId || draft.conversationId !== conversationId,
          ),
          {
            resourceId,
            conversationId,
            text,
            updatedAt: Math.max(Date.now(), (current?.updatedAt ?? 0) + 1),
          },
        ],
      }));
    },
    loadConversationSummaries: (bookId) => {
      const pending = summaryRequests.get(bookId);
      if (pending) return pending;
      const request = (async () => {
        const started = revision;
        const sessions: ChatSessionSummary[] = [];
        let cursor: string | undefined;
        do {
          const page = await conversationsApi.list(bookId, cursor);
          sessions.push(...page.sessions);
          cursor = page.nextCursor ?? undefined;
        } while (cursor);
        if (revision !== started) return;
        const visible = sessions.filter((session) => !deleted.has(session.id));
        visible.forEach((session) => localSessions.delete(session.id));
        const ids = new Set(visible.map((session) => session.id));
        const removed = get().chatSessions.filter(
          (session) =>
            session.bookId === bookId && !ids.has(session.id) && !localSessions.has(session.id),
        );
        removed.forEach((session) => deleted.add(session.id));
        set((state) => ({
          chats: state.chats.filter((message) => !deleted.has(message.conversationId)),
          conversationSummaries: [
            ...state.conversationSummaries.filter((session) => session.bookId !== bookId),
            ...visible,
          ],
          chatSessions: [
            ...state.chatSessions.filter(
              (session) => session.bookId !== bookId || localSessions.has(session.id),
            ),
            ...visible,
          ],
        }));
      })().finally(() => summaryRequests.delete(bookId));
      summaryRequests.set(bookId, request);
      return request;
    },
    loadConversationMessages: async (bookId, id, before) => {
      const page = await conversationsApi.messages(bookId, id, before);
      if (deleted.has(id)) return { session: null, messages: [], nextCursor: null };
      if (
        !page.session &&
        !localSessions.has(id) &&
        get().chatSessions.some((session) => session.id === id)
      ) {
        deleted.add(id);
        set((state) => ({
          chats: state.chats.filter((message) => message.conversationId !== id),
          chatSessions: state.chatSessions.filter((session) => session.id !== id),
          conversationSummaries: state.conversationSummaries.filter((session) => session.id !== id),
        }));
        return page;
      }
      if (page.session) localSessions.delete(id);
      set((state) => ({
        chats: mergeMessages(state.chats, page.messages),
        ...(page.session
          ? {
              chatSessions: [
                ...state.chatSessions.filter((session) => session.id !== id),
                page.session,
              ],
            }
          : {}),
      }));
      return page;
    },
    markChatMessagesRead: async (messageIds) => {
      const ids = new Set(messageIds.filter((id) => !reading.has(id)));
      const messages = get().chats.filter(
        (message) => ids.has(message.id) && message.role === 'assistant' && !message.readAt,
      );
      if (!messages.length) return;
      messages.forEach((message) => reading.add(message.id));
      try {
        for (const id of new Set(messages.map((message) => message.conversationId))) {
          const sessionIds = messages
            .filter((message) => message.conversationId === id)
            .map((message) => message.id);
          for (let offset = 0; offset < sessionIds.length; offset += 100)
            await conversationsApi.markRead(id, sessionIds.slice(offset, offset + 100));
        }
        revision++;
        const readAt = Date.now();
        set((state) => ({
          chats: state.chats.map((message) =>
            ids.has(message.id) && message.role === 'assistant' && !message.readAt
              ? { ...message, readAt }
              : message,
          ),
          conversationSummaries: state.conversationSummaries.map((session) => ({
            ...session,
            unreadCount: Math.max(
              0,
              session.unreadCount -
                messages.filter((message) => message.conversationId === session.id).length,
            ),
          })),
        }));
      } finally {
        messages.forEach((message) => reading.delete(message.id));
      }
    },
    createChatSession: (session) => {
      localSessions.add(session.id);
      set((state) => ({
        chatSessions: [session, ...state.chatSessions.filter((item) => item.id !== session.id)],
      }));
    },
    updateChatSession: async (sessionId, changes) => {
      // New sessions are created atomically with their first user message by the AI task API.
      if (!localSessions.has(sessionId)) await conversationsApi.update(sessionId, changes);
      revision++;
      set((state) => ({
        chatSessions: state.chatSessions.map((session) =>
          session.id === sessionId ? { ...session, ...changes } : session,
        ),
        conversationSummaries: state.conversationSummaries.map((session) =>
          session.id === sessionId ? { ...session, ...changes } : session,
        ),
      }));
    },
    deleteChatSession: async (sessionId) => {
      await conversationsApi.delete(sessionId);
      deleted.add(sessionId);
      revision++;
      set((state) => ({
        conversationDrafts: state.conversationDrafts.filter(
          (draft) => draft.conversationId !== sessionId,
        ),
        chats: state.chats.filter((message) => message.conversationId !== sessionId),
        chatSessions: state.chatSessions.filter((session) => session.id !== sessionId),
        conversationSummaries: state.conversationSummaries.filter(
          (session) => session.id !== sessionId,
        ),
      }));
    },
    addChatMessage: (message) =>
      set((state) => ({
        chats: mergeMessages(state.chats, [message]),
        chatSessions: state.chatSessions.map((session) =>
          session.id === message.conversationId
            ? { ...session, updatedAt: Math.max(session.updatedAt, message.createdAt) }
            : session,
        ),
      })),
  };
}
