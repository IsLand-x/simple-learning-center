// Read receipts are monotonic; stale clients must not turn read replies into unread ones.
export function protectChatReadState(incoming, current) {
  if (!Array.isArray(incoming?.state?.chats)) return incoming;
  const saved = new Map((current?.state?.chats ?? []).map((message) => [message.id, message]));
  return {
    ...incoming,
    state: {
      ...incoming.state,
      chats: incoming.state.chats.map((message) => {
        const readAt = Math.max(message.readAt || 0, saved.get(message.id)?.readAt || 0);
        return readAt ? { ...message, readAt } : message;
      }),
    },
  };
}
