import type { RssItem } from '../../../../contracts/rss.js';
import type { PersistedState } from '../types.js';

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

function mergeConcurrentItem(incomingItem: RssItem, currentItem: RssItem) {
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

export function rssState(persistedState: PersistedState | null) {
  return persistedState?.state && typeof persistedState.state === 'object'
    ? persistedState.state
    : null;
}

export function protectServerRssState(
  incomingPersistedState: PersistedState,
  currentPersistedState: PersistedState | null,
) {
  const incoming = rssState(incomingPersistedState);
  const current = rssState(currentPersistedState);
  const originalIncomingVersion = Number(incomingPersistedState?.version || 0);
  if (!incoming || !current || Number(incomingPersistedState.version || 0) < 16) {
    return incomingPersistedState;
  }

  const incomingFeeds = Array.isArray(incoming.rssFeeds) ? incoming.rssFeeds : [];
  const currentFeeds = new Map(
    (Array.isArray(current.rssFeeds) ? current.rssFeeds : []).map((feed) => [feed.id, feed]),
  );
  incoming.rssFeeds = incomingFeeds.map((feed) => {
    const serverFeed = currentFeeds.get(feed.id);
    if (!serverFeed || Number(serverFeed.lastFetchedAt || 0) <= Number(feed.lastFetchedAt || 0)) {
      return feed;
    }
    return {
      ...feed,
      siteUrl: serverFeed.siteUrl || feed.siteUrl,
      description: serverFeed.description || feed.description,
      lastFetchedAt: serverFeed.lastFetchedAt,
      lastSuccessAt: serverFeed.lastSuccessAt,
      lastError: serverFeed.lastError,
      lastErrorCode: serverFeed.lastErrorCode,
    };
  });

  const activeFeedIds = new Set(incoming.rssFeeds.map((feed) => feed.id));
  const incomingItems = Array.isArray(incoming.rssItems) ? incoming.rssItems : [];
  const incomingById = new Map(incomingItems.map((item) => [item.id, item]));
  const currentItems = (Array.isArray(current.rssItems) ? current.rssItems : []).filter((item) =>
    activeFeedIds.has(item.feedId),
  );
  const mergedItems = incomingItems.map((item) => {
    const serverItem = currentItems.find((candidate) => candidate.id === item.id);
    return serverItem ? mergeConcurrentItem(item, serverItem) : item;
  });
  currentItems.forEach((item) => {
    if (!incomingById.has(item.id)) mergedItems.push(item);
  });
  incoming.rssItems = Array.from(activeFeedIds).flatMap((feedId) =>
    mergedItems
      .filter((item) => item.feedId === feedId)
      .sort((left, right) => right.publishedAt - left.publishedAt),
  );
  const incomingSupportsDigests = Number(incomingPersistedState.version || 0) >= 19;
  const incomingDigests =
    incomingSupportsDigests && Array.isArray(incoming.rssDailyDigests)
      ? incoming.rssDailyDigests
      : [];
  const incomingDigestIds = new Set(incomingDigests.map((digest) => digest.id));
  const currentDigests = Array.isArray(current.rssDailyDigests) ? current.rssDailyDigests : [];
  incoming.rssDailyDigests = [
    ...incomingDigests.map((digest) => {
      const serverDigest = currentDigests.find((item) => item.id === digest.id);
      return serverDigest && Number(serverDigest.updatedAt || 0) > Number(digest.updatedAt || 0)
        ? serverDigest
        : digest;
    }),
    ...currentDigests.filter((digest) => !incomingDigestIds.has(digest.id)),
  ].sort((left, right) => right.date.localeCompare(left.date));
  const incomingDigestSettings = incomingSupportsDigests
    ? incoming.rssDigestSettings || {}
    : current.rssDigestSettings || {};
  const currentDigestSettings = current.rssDigestSettings || {};
  incoming.rssDigestSettings = {
    ...incomingDigestSettings,
    ...(Number(currentDigestSettings.lastAttemptAt || 0) >
    Number(incomingDigestSettings.lastAttemptAt || 0)
      ? {
          lastAttemptAt: currentDigestSettings.lastAttemptAt,
          lastScheduledKey: currentDigestSettings.lastScheduledKey,
        }
      : {}),
    ...(Number(currentDigestSettings.lastCompletedAt || 0) >
    Number(incomingDigestSettings.lastCompletedAt || 0)
      ? {
          lastCompletedAt: currentDigestSettings.lastCompletedAt,
          lastError: currentDigestSettings.lastError,
        }
      : {}),
  };
  if (Number(currentPersistedState!.version || 0) >= 20) {
    incoming.rssDigestRuns = structuredClone(
      Array.isArray(current.rssDigestRuns) ? current.rssDigestRuns : [],
    );
  }
  if (
    Number(currentPersistedState!.version || 0) >= 21 &&
    Number(incomingPersistedState.version || 0) < 21
  ) {
    incoming.rssDigestSettings = structuredClone(current.rssDigestSettings || {});
    incomingPersistedState.version = currentPersistedState!.version;
  }
  if (Number(currentPersistedState!.version || 0) >= 23 && originalIncomingVersion < 23) {
    const currentFeedsById = new Map(
      (Array.isArray(current.rssFeeds) ? current.rssFeeds : []).map((feed) => [feed.id, feed]),
    );
    incoming.rssFeeds = (Array.isArray(incoming.rssFeeds) ? incoming.rssFeeds : []).map((feed) => {
      const currentFeed = currentFeedsById.get(feed.id);
      return currentFeed?.source ? { ...feed, source: structuredClone(currentFeed.source) } : feed;
    });
    incomingPersistedState.version = currentPersistedState!.version;
  }
  return incomingPersistedState;
}
