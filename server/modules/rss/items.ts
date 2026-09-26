import type { RssItem } from '../../../contracts/domain.js';

const FULL_CONTENT_FIELDS: Array<keyof RssItem> = [
  'fullContentHtml',
  'fullContentText',
  'fullContentUrl',
  'fullContentFetchedAt',
  'fullContentError',
];

function copyFullContent(target: RssItem, source: RssItem) {
  FULL_CONTENT_FIELDS.forEach((field) => copyOptionalField(target, source, field));
  return target;
}

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

function copyOptionalField<K extends keyof RssItem>(target: RssItem, source: RssItem, field: K) {
  if (Object.hasOwn(source, field)) target[field] = source[field];
  else delete target[field];
}

function readStateUpdatedAt(item: RssItem) {
  if (Number.isFinite(item?.readStateUpdatedAt)) return item.readStateUpdatedAt!;
  return Number.isFinite(item?.readAt) ? item.readAt! : 0;
}

function copyReadState(target: RssItem, source: RssItem) {
  copyOptionalField(target, source, 'readAt');
  const updatedAt = readStateUpdatedAt(source);
  if (updatedAt > 0) target.readStateUpdatedAt = updatedAt;
  else delete target.readStateUpdatedAt;
}

export function mergeConcurrentItem(incomingItem: RssItem, currentItem: RssItem) {
  const currentIsNewer = Number(currentItem.fetchedAt || 0) > Number(incomingItem.fetchedAt || 0);
  const merged = currentIsNewer
    ? { ...incomingItem, ...currentItem }
    : { ...currentItem, ...incomingItem };
  const readStateSource =
    readStateUpdatedAt(currentItem) > readStateUpdatedAt(incomingItem) ? currentItem : incomingItem;
  copyReadState(merged, readStateSource);
  copyOptionalField(merged, incomingItem, 'bookmarkedAt');
  const incomingFullContentAt = Number(incomingItem.fullContentFetchedAt || 0);
  const currentFullContentAt = Number(currentItem.fullContentFetchedAt || 0);
  const fullContentSource =
    currentFullContentAt > incomingFullContentAt ? currentItem : incomingItem;
  copyFullContent(merged, fullContentSource);
  const incomingSummaryAt = Number(incomingItem.aiSummaryUpdatedAt || 0);
  const currentSummaryAt = Number(currentItem.aiSummaryUpdatedAt || 0);
  const summarySource =
    incomingFullContentAt === currentFullContentAt
      ? currentSummaryAt > incomingSummaryAt
        ? currentItem
        : incomingItem
      : fullContentSource;
  copyOptionalField(merged, summarySource, 'aiSummary');
  copyOptionalField(merged, summarySource, 'aiSummaryUpdatedAt');
  copyOptionalField(merged, summarySource, 'aiSummaryVersion');
  const incomingTranslationAt = Number(incomingItem.aiTranslationUpdatedAt || 0);
  const currentTranslationAt = Number(currentItem.aiTranslationUpdatedAt || 0);
  const translationSource =
    incomingFullContentAt === currentFullContentAt
      ? currentTranslationAt > incomingTranslationAt
        ? currentItem
        : incomingItem
      : fullContentSource;
  copyOptionalField(merged, translationSource, 'aiTranslation');
  copyOptionalField(merged, translationSource, 'aiTranslationHtml');
  copyOptionalField(merged, translationSource, 'aiTranslationUpdatedAt');
  copyOptionalField(merged, translationSource, 'aiTranslationSourceFetchedAt');
  if (
    !merged.aiTranslationHtml &&
    currentItem.aiTranslationHtml &&
    merged.aiTranslation === currentItem.aiTranslation &&
    incomingFullContentAt === currentFullContentAt
  ) {
    merged.aiTranslationHtml = currentItem.aiTranslationHtml;
  }
  return merged;
}
