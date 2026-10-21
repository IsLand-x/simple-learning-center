import type { ConversationDraft } from '../../../contracts/ai';

export function mergeConversationDrafts(
  current: ConversationDraft[],
  incoming: ConversationDraft[],
) {
  const drafts = new Map<string, ConversationDraft>();
  for (const draft of [...current, ...incoming]) {
    const key = JSON.stringify([draft.resourceId, draft.conversationId]);
    if ((drafts.get(key)?.updatedAt ?? -1) <= draft.updatedAt) drafts.set(key, draft);
  }
  return [...drafts.values()];
}
