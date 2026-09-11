import { useCallback, useEffect, useMemo, useRef, type Dispatch, type SetStateAction } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { getRssVideoPresentation } from '../../../lib/rssVideo';
import type { RssDailyDigest, RssFeed, RssItem } from '../../../types';
import type { RssMobilePanel, RssMobileView } from '../../../components/RssMobileWorkspace';
import {
  RSS_SMART_SOURCE_IDS,
  isRssMobilePanel,
  isRssMobileView,
  isTimeRange,
  localDateKey,
  rssItemContentText,
  rssSearchPreview,
  startOfToday,
  type RssSidePanel,
  type TimeRange,
} from '../model/rssPageModel';

type UpdateRssItem = (itemId: string, changes: Partial<RssItem>) => void;

export function useRssPageNavigation({
  dailyDigests,
  feeds,
  items,
  mobileLayout,
  query,
  setActivePanel,
  updateRssItem,
}: {
  dailyDigests: RssDailyDigest[];
  feeds: RssFeed[];
  items: RssItem[];
  mobileLayout: boolean;
  query: string;
  setActivePanel: Dispatch<SetStateAction<RssSidePanel>>;
  updateRssItem: UpdateRssItem;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
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
  const automaticallySelectedItemIdRef = useRef<string | null>(
    !mobileLayout && feedById.has(selectedFeedId) && !requestedItemMatchesSource
      ? selectedItemId
      : null,
  );
  const pendingAutomaticSourceIdRef = useRef<string | null>(null);
  const selectedItemIdRef = useRef(selectedItemId);
  selectedItemIdRef.current = selectedItemId;
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

  const setSelectedFeedId = useCallback(
    (sourceId: string) => {
      automaticallySelectedItemIdRef.current = null;
      pendingAutomaticSourceIdRef.current =
        !mobileLayout && !RSS_SMART_SOURCE_IDS.has(sourceId) ? sourceId : null;
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          next.set('source', sourceId);
          if (sourceId !== 'daily') next.set('range', 'all');
          if (RSS_SMART_SOURCE_IDS.has(sourceId)) next.delete('feed');
          else next.set('feed', sourceId);
          next.delete('item');
          next.delete('digest');
          return next;
        },
        { replace: true },
      );
    },
    [mobileLayout, setSearchParams],
  );
  const setSelectedItemId = useCallback(
    (itemId: string | null) => {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          next.set('source', selectedFeedId);
          if (itemId) {
            const item = items.find((candidate) => candidate.id === itemId);
            if (item) {
              next.set('feed', item.feedId);
              next.set('item', item.id);
              next.delete('digest');
              return next;
            }
          }
          next.delete('item');
          if (feedById.has(selectedFeedId)) next.set('feed', selectedFeedId);
          else next.delete('feed');
          return next;
        },
        { replace: true },
      );
    },
    [feedById, items, selectedFeedId, setSearchParams],
  );
  const setSelectedDigestId = useCallback(
    (digestId: string | null) => {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          next.set('source', 'daily');
          next.delete('feed');
          next.delete('item');
          if (digestId) next.set('digest', digestId);
          else next.delete('digest');
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );
  const setTimeRange = useCallback(
    (range: TimeRange) => {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          next.set('range', range);
          next.delete('item');
          next.delete('digest');
          if (feedById.has(selectedFeedId)) next.set('feed', selectedFeedId);
          else next.delete('feed');
          return next;
        },
        { replace: true },
      );
    },
    [feedById, selectedFeedId, setSearchParams],
  );

  useEffect(() => {
    const pendingSourceId = pendingAutomaticSourceIdRef.current;
    if (pendingSourceId) {
      pendingAutomaticSourceIdRef.current = null;
      automaticallySelectedItemIdRef.current =
        pendingSourceId === selectedFeedId ? selectedItemId : null;
      return;
    }
    if (automaticallySelectedItemIdRef.current !== selectedItemId) {
      automaticallySelectedItemIdRef.current = null;
    }
  }, [selectedFeedId, selectedItemId]);

  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    next.set('source', selectedFeedId);
    next.set('range', timeRange);
    if (
      selectedFeedId === 'daily' &&
      selectedDigest &&
      (!mobileLayout || mobileView === 'detail')
    ) {
      next.delete('feed');
      next.delete('item');
      next.set('digest', selectedDigest.id);
    } else if (selectedItem && selectedItemId && (!mobileLayout || mobileView === 'detail')) {
      next.set('feed', selectedItem.feedId);
      next.set('item', selectedItemId);
      next.delete('digest');
    } else {
      next.delete('item');
      next.delete('digest');
      if (feedById.has(selectedFeedId)) next.set('feed', selectedFeedId);
      else next.delete('feed');
    }
    if (!mobileLayout || mobileView !== 'detail') next.delete('panel');
    if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true });
  }, [
    feedById,
    mobileLayout,
    mobileView,
    searchParams,
    selectedDigest,
    selectedFeedId,
    selectedItem,
    selectedItemId,
    setSearchParams,
    timeRange,
  ]);

  const selectSource = (sourceId: string) => {
    if (!mobileLayout) {
      if (sourceId === 'daily') setActivePanel(null);
      setSelectedFeedId(sourceId);
      return;
    }
    setActivePanel(null);
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.set('source', sourceId);
        next.set('view', 'items');
        if (sourceId !== 'daily') next.set('range', 'all');
        next.delete('item');
        next.delete('digest');
        next.delete('panel');
        if (RSS_SMART_SOURCE_IDS.has(sourceId)) next.delete('feed');
        else next.set('feed', sourceId);
        return next;
      },
      { replace: false },
    );
  };

  const openDigest = (digest: RssDailyDigest) => {
    if (mobileLayout) {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          next.set('source', 'daily');
          next.set('digest', digest.id);
          next.set('view', 'detail');
          next.delete('feed');
          next.delete('item');
          next.delete('panel');
          return next;
        },
        { replace: false },
      );
      return;
    }
    setSelectedDigestId(digest.id);
  };

  const openItem = (item: RssItem) => {
    automaticallySelectedItemIdRef.current = null;
    pendingAutomaticSourceIdRef.current = null;
    if (mobileLayout) {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          next.set('source', selectedFeedId);
          next.set('feed', item.feedId);
          next.set('item', item.id);
          next.set('view', 'detail');
          next.delete('panel');
          return next;
        },
        { replace: false },
      );
    } else {
      setSelectedItemId(item.id);
    }
    if (!item.readAt) updateRssItem(item.id, { readAt: Date.now() });
  };

  const markAutomaticallySelectedItemRead = (scrollContainer: HTMLElement) => {
    if (
      scrollContainer.scrollTop <= 0 ||
      !selectedItem ||
      selectedItem.readAt ||
      automaticallySelectedItemIdRef.current !== selectedItem.id
    )
      return;
    automaticallySelectedItemIdRef.current = null;
    updateRssItem(selectedItem.id, { readAt: Date.now() });
  };

  const showMobileSources = () => {
    setActivePanel(null);
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.set('view', 'sources');
        next.delete('item');
        next.delete('digest');
        next.delete('panel');
        return next;
      },
      { replace: true },
    );
  };

  const showMobileItems = () => {
    setActivePanel(null);
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.set('view', 'items');
        next.delete('item');
        next.delete('digest');
        next.delete('panel');
        return next;
      },
      { replace: true },
    );
  };

  const changeMobilePanel = (panel: RssMobilePanel) => {
    if (!panel) {
      const state = location.state as { rssMobilePanelEntry?: boolean } | null;
      if (state?.rssMobilePanelEntry) {
        navigate(-1);
        return;
      }
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          next.delete('panel');
          return next;
        },
        { replace: true },
      );
      return;
    }
    const replacingPanel = Boolean(mobilePanel);
    const previousState =
      location.state && typeof location.state === 'object'
        ? (location.state as Record<string, unknown>)
        : {};
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.set('panel', panel);
        return next;
      },
      {
        replace: replacingPanel,
        state: replacingPanel ? previousState : { ...previousState, rssMobilePanelEntry: true },
      },
    );
  };

  return {
    changeMobilePanel,
    digestList,
    feedById,
    filteredItems,
    hasSelectedTranslation,
    isSelectedVideo,
    markAutomaticallySelectedItemRead,
    mobilePanel,
    mobileView,
    nextItem,
    openDigest,
    openItem,
    previousItem,
    searchPreviews,
    selectSource,
    selectedDigest,
    selectedFeed,
    selectedFeedId,
    selectedItem,
    selectedItemId,
    selectedItemIdRef,
    selectedVideoPresentation,
    setSelectedFeedId,
    setSelectedItemId,
    setTimeRange,
    showMobileItems,
    showMobileSources,
    timeRange,
    todayItems,
    todayKey,
  };
}
