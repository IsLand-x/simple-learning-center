import { useMemo } from 'react';
import type { RssDailyDigest, RssFeed, RssItem } from '../../../../../contracts/rss';
import { localDateKey, startOfToday } from '../components/rssFormat';
import { rssItemContentText, rssSearchPreview } from '../components/rssSearch';
import { getRssVideoPresentation } from '../components/rssVideo';
import type { RssMobilePanel, RssMobileView } from './navigation';
import {
  RSS_SMART_SOURCE_IDS,
  isRssMobilePanel,
  isRssMobileView,
  isTimeRange,
  type TimeRange,
} from './navigation';

export function useNavigationSelection({
  dailyDigests,
  feeds,
  items,
  mobileLayout,
  query,
  searchParams,
}: {
  dailyDigests: RssDailyDigest[];
  feeds: RssFeed[];
  items: RssItem[];
  mobileLayout: boolean;
  query: string;
  searchParams: URLSearchParams;
}) {
  const feedById = useMemo(() => new Map(feeds.map((feed) => [feed.id, feed])), [feeds]);
  const todayKey = localDateKey();
  const todayItems = items.filter((item) => localDateKey(item.publishedAt) === todayKey);
  const digestList = useMemo(() => {
    const sorted = [...dailyDigests].sort((left, right) => right.date.localeCompare(left.date));
    return sorted.some((digest) => digest.date === todayKey)
      ? sorted
      : [
          {
            id: `rss-digest:${todayKey}`,
            date: todayKey,
            content: '',
            sourceItemIds: [],
            sourceFeedIds: [],
            itemCount: 0,
            model: '',
            generatedAt: Date.now(),
            updatedAt: 0,
          },
          ...sorted,
        ];
  }, [dailyDigests, todayKey]);
  const requestedSourceId = searchParams.get('source') || searchParams.get('feed') || 'all';
  const selectedFeedId =
    RSS_SMART_SOURCE_IDS.has(requestedSourceId) || feedById.has(requestedSourceId)
      ? requestedSourceId
      : 'all';
  const selectedFeedItems = useMemo(
    () =>
      items.filter((item) => {
        if (selectedFeedId === 'all') return true;
        if (selectedFeedId === 'unread') return !item.readAt;
        if (selectedFeedId === 'bookmarked') return Boolean(item.bookmarkedAt);
        return item.feedId === selectedFeedId;
      }),
    [items, selectedFeedId],
  );
  const requestedTimeRange = searchParams.get('range');
  const defaultTimeRange: TimeRange = selectedFeedItems.some(
    (item) => item.publishedAt >= startOfToday(),
  )
    ? 'today'
    : 'seven-days';
  const timeRange: TimeRange = isTimeRange(requestedTimeRange)
    ? requestedTimeRange
    : defaultTimeRange;
  const filteredItems = useMemo(() => {
    const today = startOfToday();
    const sevenDaysAgo = today - 6 * 24 * 60 * 60 * 1_000;
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return selectedFeedItems
      .filter((item) => {
        if (timeRange === 'today' && item.publishedAt < today) return false;
        if (timeRange === 'seven-days' && item.publishedAt < sevenDaysAgo) return false;
        if (!normalizedQuery) return true;
        const feed = feedById.get(item.feedId);
        return `${item.title} ${item.author ?? ''} ${rssItemContentText(item)} ${feed?.title ?? ''}`
          .toLocaleLowerCase()
          .includes(normalizedQuery);
      })
      .sort((left, right) => right.publishedAt - left.publishedAt);
  }, [feedById, query, selectedFeedItems, timeRange]);
  const searchPreviews = useMemo(
    () =>
      new Map(
        query.trim() ? filteredItems.map((item) => [item.id, rssSearchPreview(item, query)]) : [],
      ),
    [filteredItems, query],
  );
  const requestedItem = items.find((item) => item.id === searchParams.get('item'));
  const requestedItemMatchesSource =
    selectedFeedId !== 'daily' &&
    requestedItem &&
    (RSS_SMART_SOURCE_IDS.has(selectedFeedId) || requestedItem.feedId === selectedFeedId);
  const selectedItem = requestedItemMatchesSource
    ? requestedItem
    : mobileLayout
      ? undefined
      : filteredItems[0];
  const requestedDigest = digestList.find((digest) => digest.id === searchParams.get('digest'));
  const selectedDigest =
    selectedFeedId === 'daily'
      ? (requestedDigest ?? (mobileLayout ? undefined : digestList[0]))
      : undefined;
  const selectedItemId = selectedItem?.id ?? null;
  const hasSelectedTranslation = Boolean(
    selectedItem?.aiTranslationHtml || selectedItem?.aiTranslation,
  );
  const selectedItemIndex = selectedItem
    ? filteredItems.findIndex((item) => item.id === selectedItem.id)
    : -1;
  const previousItem = selectedItemIndex > 0 ? filteredItems[selectedItemIndex - 1] : undefined;
  const nextItem =
    selectedItemIndex >= 0 && selectedItemIndex < filteredItems.length - 1
      ? filteredItems[selectedItemIndex + 1]
      : undefined;
  const selectedFeed = selectedItem ? feedById.get(selectedItem.feedId) : undefined;
  const isSelectedVideo = selectedFeed?.type === 'video';
  const selectedVideoPresentation = useMemo(
    () => (selectedItem ? getRssVideoPresentation(selectedItem, selectedFeed) : undefined),
    [selectedFeed, selectedItem],
  );
  const requestedMobileView = searchParams.get('view');
  const inferredMobileView: RssMobileView = selectedItem || selectedDigest ? 'detail' : 'sources';
  const mobileView: RssMobileView = isRssMobileView(requestedMobileView)
    ? requestedMobileView === 'detail' && !selectedItem && !selectedDigest
      ? 'items'
      : requestedMobileView
    : inferredMobileView;
  const requestedMobilePanel = searchParams.get('panel');
  const mobilePanel: RssMobilePanel =
    mobileLayout && mobileView === 'detail' && isRssMobilePanel(requestedMobilePanel)
      ? requestedMobilePanel
      : null;

  return {
    digestList,
    feedById,
    filteredItems,
    hasSelectedTranslation,
    isSelectedVideo,
    mobilePanel,
    mobileView,
    nextItem,
    previousItem,
    requestedItemMatchesSource,
    searchPreviews,
    selectedDigest,
    selectedFeed,
    selectedFeedId,
    selectedItem,
    selectedItemId,
    selectedVideoPresentation,
    timeRange,
    todayItems,
    todayKey,
  };
}
