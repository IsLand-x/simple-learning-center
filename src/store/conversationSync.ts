const active = new Map<string, Set<() => Promise<void>>>();

export function subscribeConversationRefresh(key: string, refresh: () => Promise<void>) {
  const listeners = active.get(key) ?? new Set();
  listeners.add(refresh);
  active.set(key, listeners);
  return () => {
    listeners.delete(refresh);
    if (!listeners.size) active.delete(key);
  };
}

export async function refreshActiveConversations() {
  await Promise.all([...active.values()].map((listeners) => [...listeners][0]()));
}
