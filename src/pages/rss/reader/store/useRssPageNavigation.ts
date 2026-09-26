import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import type { RssDailyDigest, RssFeed, RssItem } from '../../../../../contracts/rss';
import type { RssMobilePanel } from './navigation';
import { RSS_SMART_SOURCE_IDS, type RssSidePanel, type TimeRange } from './navigation';
import { useNavigationSelection } from './useNavigationSelection';

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
  const {
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
  } = useNavigationSelection({ dailyDigests, feeds, items, mobileLayout, query, searchParams });
  const automaticallySelectedItemIdRef = useRef<string | null>(
    !mobileLayout && feedById.has(selectedFeedId) && !requestedItemMatchesSource
      ? selectedItemId
      : null,
  );
  const pendingAutomaticSourceIdRef = useRef<string | null>(null);
  const selectedItemIdRef = useRef(selectedItemId);
  selectedItemIdRef.current = selectedItemId;
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
