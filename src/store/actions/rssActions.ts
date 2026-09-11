import type { LearningState, LearningStoreSet } from '../learningState';

type RssActions = Pick<
  LearningState,
  | 'addRssFolder'
  | 'updateRssFolder'
  | 'moveRssFolder'
  | 'deleteRssFolder'
  | 'upsertRssFeed'
  | 'updateRssFeed'
  | 'moveRssFeed'
  | 'deleteRssFeed'
  | 'mergeRssItems'
  | 'updateRssItem'
  | 'addRssAnnotation'
  | 'updateRssAnnotation'
  | 'deleteRssAnnotation'
  | 'upsertRssDailyDigest'
  | 'setRssDigestSettings'
  | 'markRssItemsRead'
  | 'markRssItemsUnread'
  | 'setRssPanelWidth'
>;

export function createRssActions(set: LearningStoreSet): RssActions {
  return {
    addRssFolder: (folder) =>
      set((state) => ({
        rssFolders: [folder, ...state.rssFolders.filter((item) => item.id !== folder.id)],
      })),
    updateRssFolder: (folderId, changes) =>
      set((state) => ({
        rssFolders: state.rssFolders.map((folder) =>
          folder.id === folderId ? { ...folder, ...changes, updatedAt: Date.now() } : folder,
        ),
      })),
    moveRssFolder: (folderId, beforeFolderId) =>
      set((state) => {
        if (folderId === beforeFolderId) return state;
        const folder = state.rssFolders.find((item) => item.id === folderId);
        if (!folder) return state;
        const remaining = state.rssFolders.filter((item) => item.id !== folderId);
        const targetIndex = beforeFolderId
          ? remaining.findIndex((item) => item.id === beforeFolderId)
          : remaining.length;
        if (targetIndex < 0) return state;
        remaining.splice(targetIndex, 0, folder);
        return { rssFolders: remaining };
      }),
    deleteRssFolder: (folderId) =>
      set((state) => ({
        rssFolders: state.rssFolders.filter((folder) => folder.id !== folderId),
        rssFeeds: state.rssFeeds.map((feed) => {
          if (feed.folderId !== folderId) return feed;
          const { folderId: _folderId, ...withoutFolder } = feed;
          return { ...withoutFolder, updatedAt: Date.now() };
        }),
      })),
    upsertRssFeed: (feed) =>
      set((state) => ({
        rssFeeds: [feed, ...state.rssFeeds.filter((item) => item.id !== feed.id)],
      })),
    updateRssFeed: (feedId, changes) =>
      set((state) => ({
        rssFeeds: state.rssFeeds.map((feed) =>
          feed.id === feedId
            ? { ...feed, ...changes, updatedAt: changes.updatedAt ?? Date.now() }
            : feed,
        ),
      })),
    moveRssFeed: (feedId, folderId, beforeFeedId) =>
      set((state) => {
        if (feedId === beforeFeedId) return state;
        const feed = state.rssFeeds.find((item) => item.id === feedId);
        if (!feed) return state;
        const movedFeed = { ...feed, folderId, updatedAt: Date.now() };
        const remaining = state.rssFeeds.filter((item) => item.id !== feedId);
        let targetIndex = beforeFeedId
          ? remaining.findIndex((item) => item.id === beforeFeedId)
          : -1;
        if (targetIndex < 0) {
          const folderKey = folderId ?? '';
          let lastFolderFeedIndex = -1;
          remaining.forEach((item, index) => {
            if ((item.folderId ?? '') === folderKey) lastFolderFeedIndex = index;
          });
          targetIndex = lastFolderFeedIndex >= 0 ? lastFolderFeedIndex + 1 : remaining.length;
        }
        remaining.splice(targetIndex, 0, movedFeed);
        return { rssFeeds: remaining };
      }),
    deleteRssFeed: (feedId) =>
      set((state) => {
        const removedRssItemIds = new Set(
          state.rssItems.filter((item) => item.feedId === feedId).map((item) => item.id),
        );
        const removedItemIds = new Set(Array.from(removedRssItemIds, (itemId) => `rss:${itemId}`));
        return {
          rssFeeds: state.rssFeeds.filter((feed) => feed.id !== feedId),
          rssItems: state.rssItems.filter((item) => item.feedId !== feedId),
          rssAnnotations: state.rssAnnotations.filter(
            (annotation) => !removedRssItemIds.has(annotation.itemId),
          ),
          rssDailyDigests: state.rssDailyDigests.map((digest) => {
            const sourceItemIds = digest.sourceItemIds.filter(
              (itemId) => !removedRssItemIds.has(itemId),
            );
            return {
              ...digest,
              sourceItemIds,
              sourceFeedIds: digest.sourceFeedIds.filter((itemId) => itemId !== feedId),
              itemCount: sourceItemIds.length,
            };
          }),
          chats: state.chats.filter((message) => !removedItemIds.has(message.bookId)),
          chatSessions: state.chatSessions.filter((session) => !removedItemIds.has(session.bookId)),
        };
      }),
    mergeRssItems: (feedId, items) =>
      set((state) => {
        const existing = new Map(
          state.rssItems.filter((item) => item.feedId === feedId).map((item) => [item.id, item]),
        );
        const merged = items.map((item) => {
          const previous = existing.get(item.id);
          if (!previous) return item;
          const hasNewFullContent =
            Number(item.fullContentFetchedAt || 0) > Number(previous.fullContentFetchedAt || 0);
          return {
            ...item,
            ...(previous.readAt ? { readAt: previous.readAt } : {}),
            ...(previous.readStateUpdatedAt
              ? { readStateUpdatedAt: previous.readStateUpdatedAt }
              : {}),
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
        return {
          rssItems: [...state.rssItems.filter((item) => item.feedId !== feedId), ...feedItems],
        };
      }),
    updateRssItem: (itemId, changes) =>
      set((state) => ({
        rssItems: state.rssItems.map((item) =>
          item.id === itemId
            ? {
                ...item,
                ...changes,
                ...(Object.hasOwn(changes, 'readAt') ? { readStateUpdatedAt: Date.now() } : {}),
              }
            : item,
        ),
      })),
    addRssAnnotation: (annotation) =>
      set((state) => ({
        rssAnnotations: [
          annotation,
          ...state.rssAnnotations.filter((item) => item.id !== annotation.id),
        ],
      })),
    updateRssAnnotation: (annotationId, changes) =>
      set((state) => ({
        rssAnnotations: state.rssAnnotations.map((annotation) =>
          annotation.id === annotationId ? { ...annotation, ...changes } : annotation,
        ),
      })),
    deleteRssAnnotation: (annotationId) =>
      set((state) => ({
        rssAnnotations: state.rssAnnotations.filter((annotation) => annotation.id !== annotationId),
      })),
    upsertRssDailyDigest: (digest) =>
      set((state) => ({
        rssDailyDigests: [
          digest,
          ...state.rssDailyDigests.filter((item) => item.id !== digest.id),
        ].sort((left, right) => right.date.localeCompare(left.date)),
      })),
    setRssDigestSettings: (changes) =>
      set((state) => ({
        rssDigestSettings: { ...state.rssDigestSettings, ...changes },
      })),
    markRssItemsRead: (itemIds) =>
      set((state) => {
        const selectedIds = itemIds ? new Set(itemIds) : null;
        const readAt = Date.now();
        return {
          rssItems: state.rssItems.map((item) =>
            !item.readAt && (!selectedIds || selectedIds.has(item.id))
              ? { ...item, readAt, readStateUpdatedAt: readAt }
              : item,
          ),
        };
      }),
    markRssItemsUnread: (itemIds) =>
      set((state) => {
        const selectedIds = itemIds ? new Set(itemIds) : null;
        const readStateUpdatedAt = Date.now();
        return {
          rssItems: state.rssItems.map((item) => {
            if (!item.readAt || (selectedIds && !selectedIds.has(item.id))) return item;
            const { readAt: _readAt, ...unreadItem } = item;
            return { ...unreadItem, readStateUpdatedAt };
          }),
        };
      }),
    setRssPanelWidth: (width) => set({ rssPanelWidth: Math.min(720, Math.max(280, width)) }),
  };
}
