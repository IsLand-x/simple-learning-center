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
  const removedResources = new Set<string>();
  if (incoming.version >= 38 && current?.state) {
    if (Array.isArray(incoming.state.videoResources)) {
      const ids = new Set(incoming.state.videoResources.map((video) => video.id));
      for (const video of current.state.videoResources ?? []) {
        if (!ids.has(video.id)) removedResources.add(`video:${video.id}`);
      }
    }
    if (Array.isArray(incoming.state.rssFeeds)) {
      const ids = new Set(incoming.state.rssFeeds.map((feed) => feed.id));
      for (const item of current.state.rssItems ?? []) {
        if (!ids.has(item.feedId)) removedResources.add(`rss:${item.id}`);
      }
    }
  }
  const deleted = new Set(current?.deletedConversationIds ?? []);
  for (const session of [
    ...(current?.state.chatSessions ?? []),
    ...(incoming.state.chatSessions ?? []),
  ]) {
    if (removedResources.has(session.bookId)) deleted.add(session.id);
  }
  if (deleted.size) {
    incoming.deletedConversationIds = [...deleted];
    incoming.state.chatSessions = incoming.state.chatSessions?.filter(
      (session) => !deleted.has(session.id),
    );
    incoming.state.chats = incoming.state.chats?.filter(
      (message) => !deleted.has(message.conversationId) && !removedResources.has(message.bookId),
    );
  } else {
    delete incoming.deletedConversationIds;
  }
  return incoming;
}
