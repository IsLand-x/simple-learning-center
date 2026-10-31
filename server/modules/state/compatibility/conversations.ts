import type { PersistedState } from '../types.js';

export function mergeMigratedConversations(
  incoming: PersistedState,
  current: PersistedState | null,
) {
  const messages = new Map(current?.state.chats?.map((message) => [message.id, message]));
  for (const message of incoming.state.chats ?? []) messages.set(message.id, message);
  const sessions = new Map(current?.state.chatSessions?.map((session) => [session.id, session]));
  for (const session of incoming.state.chatSessions ?? []) {
    const existing = sessions.get(session.id);
    if (!existing || existing.updatedAt <= session.updatedAt) sessions.set(session.id, session);
  }
  incoming.state.chats = [...messages.values()];
  incoming.state.chatSessions = [...sessions.values()];
  return incoming;
}

export function protectConversations(incoming: PersistedState, current: PersistedState | null) {
  const deleted = new Set(current?.deletedConversationIds ?? []);
  incoming.state.conversationDrafts = incoming.state.conversationDrafts?.filter(
    (draft) => !deleted.has(draft.conversationId),
  );
  if (deleted.size) {
    incoming.deletedConversationIds = [...deleted];
    incoming.state.chatSessions = incoming.state.chatSessions?.filter(
      (session) => !deleted.has(session.id),
    );
    incoming.state.chats = incoming.state.chats?.filter(
      (message) => !deleted.has(message.conversationId),
    );
  } else {
    delete incoming.deletedConversationIds;
  }
  return incoming;
}
