import type { DiscussionItem } from '../../../contracts/reading';

export function mergeDiscussions(current: DiscussionItem[], incoming: DiscussionItem[]) {
  const items = new Map<string, DiscussionItem>();
  for (const item of [...current, ...incoming]) {
    const existing = items.get(item.id);
    if (
      !existing ||
      Math.max(item.updatedAt, item.deletedAt ?? 0) >=
        Math.max(existing.updatedAt, existing.deletedAt ?? 0)
    ) {
      items.set(item.id, item);
    }
  }
  return [...items.values()];
}
