import type { PersistedState } from '../state/types.js';
import { mergeConcurrentItem } from './items.js';

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
