import type { PersistedState } from '../types.js';

const RSS_STATE_VERSION = 16;
const RSS_DIGEST_STATE_VERSION = 19;
const RSS_DIGEST_RUN_STATE_VERSION = 20;
const RSS_DIGEST_ALL_ITEMS_STATE_VERSION = 21;
const RSS_TRANSLATED_HTML_STATE_VERSION = 22;
const RSS_SOURCE_STATE_VERSION = 23;
const VIDEO_STATE_VERSION = 18;
const BOOK_LIST_STATE_VERSION = 24;

export function protectRssStateFromOlderClient(
  persistedState: PersistedState,
  currentPersistedState: PersistedState | null,
) {
  const incomingVersion = Number.isInteger(persistedState?.version) ? persistedState.version : 0;
  const currentVersion = Number.isInteger(currentPersistedState?.version)
    ? (currentPersistedState?.version ?? 0)
    : 0;
  if (!persistedState?.state || !currentPersistedState?.state) {
    return persistedState;
  }
  const protectCoreRss = currentVersion >= RSS_STATE_VERSION && incomingVersion < RSS_STATE_VERSION;
  const protectDigests =
    currentVersion >= RSS_DIGEST_STATE_VERSION && incomingVersion < RSS_DIGEST_STATE_VERSION;
  const protectDigestRuns =
    currentVersion >= RSS_DIGEST_RUN_STATE_VERSION &&
    incomingVersion < RSS_DIGEST_RUN_STATE_VERSION;
  const protectAllItemsDigestSettings =
    currentVersion >= RSS_DIGEST_ALL_ITEMS_STATE_VERSION &&
    incomingVersion < RSS_DIGEST_ALL_ITEMS_STATE_VERSION;
  const protectTranslatedHtml =
    currentVersion >= RSS_TRANSLATED_HTML_STATE_VERSION &&
    incomingVersion < RSS_TRANSLATED_HTML_STATE_VERSION;
  const protectSources =
    currentVersion >= RSS_SOURCE_STATE_VERSION && incomingVersion < RSS_SOURCE_STATE_VERSION;
  if (
    !protectCoreRss &&
    !protectDigests &&
    !protectDigestRuns &&
    !protectAllItemsDigestSettings &&
    !protectTranslatedHtml &&
    !protectSources
  ) {
    return persistedState;
  }
  const protectedState = structuredClone(persistedState);
  protectedState.version = currentVersion;
  if (protectCoreRss || protectSources) {
    protectedState.state.rssFolders = structuredClone(
      Array.isArray(currentPersistedState.state.rssFolders)
        ? currentPersistedState.state.rssFolders
        : [],
    );
    protectedState.state.rssFeeds = structuredClone(
      Array.isArray(currentPersistedState.state.rssFeeds)
        ? currentPersistedState.state.rssFeeds
        : [],
    );
    protectedState.state.rssItems = structuredClone(
      Array.isArray(currentPersistedState.state.rssItems)
        ? currentPersistedState.state.rssItems
        : [],
    );
    protectedState.state.rssAnnotations = structuredClone(
      Array.isArray(currentPersistedState.state.rssAnnotations)
        ? currentPersistedState.state.rssAnnotations
        : [],
    );
    protectedState.state.rssPanelWidth =
      typeof currentPersistedState.state.rssPanelWidth === 'number'
        ? currentPersistedState.state.rssPanelWidth
        : 380;
  } else if (protectTranslatedHtml) {
    const currentItems = new Map(
      (Array.isArray(currentPersistedState.state.rssItems)
        ? currentPersistedState.state.rssItems
        : []
      ).map((item) => [item.id, item]),
    );
    protectedState.state.rssItems = (
      Array.isArray(protectedState.state.rssItems) ? protectedState.state.rssItems : []
    ).map((item) => {
      const currentItem = currentItems.get(item.id);
      const sourceAt = Number(item.fullContentFetchedAt || item.fetchedAt || 0);
      const currentSourceAt = Number(
        currentItem?.fullContentFetchedAt || currentItem?.fetchedAt || 0,
      );
      if (
        !currentItem?.aiTranslationHtml ||
        sourceAt !== currentSourceAt ||
        item.aiTranslation !== currentItem.aiTranslation
      ) {
        return item;
      }
      return { ...item, aiTranslationHtml: currentItem.aiTranslationHtml };
    });
  }
  if (protectDigests || protectAllItemsDigestSettings) {
    protectedState.state.rssDailyDigests = structuredClone(
      Array.isArray(currentPersistedState.state.rssDailyDigests)
        ? currentPersistedState.state.rssDailyDigests
        : [],
    );
    protectedState.state.rssDigestSettings = structuredClone(
      currentPersistedState.state.rssDigestSettings || {},
    );
  }
  if (protectDigestRuns) {
    protectedState.state.rssDigestRuns = structuredClone(
      Array.isArray(currentPersistedState.state.rssDigestRuns)
        ? currentPersistedState.state.rssDigestRuns
        : [],
    );
  }
  return protectedState;
}

export function protectVideoStateFromOlderClient(
  persistedState: PersistedState,
  currentPersistedState: PersistedState | null,
) {
  const incomingVersion = Number.isInteger(persistedState?.version) ? persistedState.version : 0;
  const currentVersion = Number.isInteger(currentPersistedState?.version)
    ? (currentPersistedState?.version ?? 0)
    : 0;
  if (
    currentVersion < VIDEO_STATE_VERSION ||
    incomingVersion >= VIDEO_STATE_VERSION ||
    !persistedState?.state ||
    !currentPersistedState?.state
  ) {
    return persistedState;
  }
  const protectedState = structuredClone(persistedState);
  protectedState.version = currentVersion;
  protectedState.state.videoResources = structuredClone(
    Array.isArray(currentPersistedState.state.videoResources)
      ? currentPersistedState.state.videoResources
      : [],
  );
  protectedState.state.videoTimestampNotes = structuredClone(
    Array.isArray(currentPersistedState.state.videoTimestampNotes)
      ? currentPersistedState.state.videoTimestampNotes
      : [],
  );
  protectedState.state.videoPanelWidth =
    typeof currentPersistedState.state.videoPanelWidth === 'number'
      ? currentPersistedState.state.videoPanelWidth
      : 400;
  return protectedState;
}

export function protectBookListStateFromOlderClient(
  persistedState: PersistedState,
  currentPersistedState: PersistedState | null,
) {
  const incomingVersion = Number.isInteger(persistedState?.version) ? persistedState.version : 0;
  const currentVersion = Number.isInteger(currentPersistedState?.version)
    ? (currentPersistedState?.version ?? 0)
    : 0;
  if (
    currentVersion < BOOK_LIST_STATE_VERSION ||
    incomingVersion >= BOOK_LIST_STATE_VERSION ||
    !persistedState?.state ||
    !currentPersistedState?.state
  ) {
    return persistedState;
  }
  const protectedState = structuredClone(persistedState);
  protectedState.version = currentVersion;
  protectedState.state.bookLists = structuredClone(
    Array.isArray(currentPersistedState.state.bookLists)
      ? currentPersistedState.state.bookLists
      : [],
  );
  return protectedState;
}
