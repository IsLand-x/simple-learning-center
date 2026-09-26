import type { RssItem } from '../../../contracts/rss.js';

export function mergeFetchedItems(
  existingItems: RssItem[],
  feedId: string,
  incomingItems: RssItem[],
) {
  const existing = new Map(
    existingItems.filter((item) => item.feedId === feedId).map((item) => [item.id, item]),
  );
  const merged = incomingItems.map((item) => {
    const previous = existing.get(item.id);
    if (!previous) return item;
    const hasNewFullContent =
      Number(item.fullContentFetchedAt || 0) > Number(previous.fullContentFetchedAt || 0);
    return {
      ...item,
      ...(previous.readAt ? { readAt: previous.readAt } : {}),
      ...(previous.readStateUpdatedAt ? { readStateUpdatedAt: previous.readStateUpdatedAt } : {}),
      ...(previous.bookmarkedAt ? { bookmarkedAt: previous.bookmarkedAt } : {}),
      ...(!hasNewFullContent && previous.aiSummary
        ? {
            aiSummary: previous.aiSummary,
            aiSummaryUpdatedAt: previous.aiSummaryUpdatedAt,
            aiSummaryVersion: previous.aiSummaryVersion,
          }
        : {}),
      ...(!hasNewFullContent && (previous.aiTranslationHtml || previous.aiTranslation)
        ? {
            aiTranslation: previous.aiTranslation,
            aiTranslationHtml: previous.aiTranslationHtml,
            aiTranslationUpdatedAt: previous.aiTranslationUpdatedAt,
            aiTranslationSourceFetchedAt: previous.aiTranslationSourceFetchedAt,
          }
        : {}),
      ...(Number(previous.fullContentFetchedAt || 0) > Number(item.fullContentFetchedAt || 0)
        ? {
            fullContentHtml: previous.fullContentHtml,
            fullContentText: previous.fullContentText,
            fullContentUrl: previous.fullContentUrl,
            fullContentFetchedAt: previous.fullContentFetchedAt,
            fullContentError: previous.fullContentError,
          }
        : {}),
    };
  });
  const mergedIds = new Set(merged.map((item) => item.id));
  const feedItems = [
    ...merged,
    ...Array.from(existing.values()).filter((item) => !mergedIds.has(item.id)),
  ].sort((left, right) => right.publishedAt - left.publishedAt);
  return [...existingItems.filter((item) => item.feedId !== feedId), ...feedItems];
}
