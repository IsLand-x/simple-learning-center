import type { LearningState, LearningStoreSet } from '../learningState';

type ConversationActions = Pick<
  LearningState,
  | 'createChatSession'
  | 'updateChatSession'
  | 'deleteChatSession'
  | 'addChatMessage'
  | 'clearBookChats'
>;

export function createConversationActions(set: LearningStoreSet): ConversationActions {
  return {
    createChatSession: (session) =>
      set((state) => ({
        chatSessions: [session, ...state.chatSessions.filter((item) => item.id !== session.id)],
      })),
    updateChatSession: (sessionId, changes) =>
      set((state) => ({
        chatSessions: state.chatSessions.map((session) =>
          session.id === sessionId ? { ...session, ...changes } : session,
        ),
      })),
    deleteChatSession: (sessionId) =>
      set((state) => ({
        chats: state.chats.filter((message) => message.conversationId !== sessionId),
        chatSessions: state.chatSessions.filter((session) => session.id !== sessionId),
      })),
    addChatMessage: (message) =>
      set((state) => ({
        chats: [...state.chats, message],
        chatSessions: state.chatSessions.map((session) =>
          session.id === message.conversationId
            ? { ...session, updatedAt: Math.max(session.updatedAt, message.createdAt) }
            : session,
        ),
      })),
    clearBookChats: (bookId) =>
      set((state) => ({
        chats: state.chats.filter((message) => message.bookId !== bookId),
        chatSessions: state.chatSessions.filter((session) => session.bookId !== bookId),
      })),
  };
}
