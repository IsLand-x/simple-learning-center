import { useEffect, useState } from 'react';
import { useLearningStore } from '../../../../store/useLearningStore';
import { useArticleState } from '../components/ArticlePanel/useArticleState';
import { useSourcesState } from '../components/SourcesPanel/useSourcesState';
import type { RssItemMenuState, RssSourceMenuState } from './menuTypes';
import type { RssSidePanel } from './navigation';
import { useRssPageNavigation } from './useRssPageNavigation';
import { useRssTasks } from './useRssTasks';
import type { WorkspaceContextValue } from './workspaceTypes';
export function useWorkspaceState(): WorkspaceContextValue {
  const feeds = useLearningStore((state) => state.rssFeeds);
  const items = useLearningStore((state) => state.rssItems);
  const dailyDigests = useLearningStore((state) => state.rssDailyDigests);
  const updateRssItem = useLearningStore((state) => state.updateRssItem);
  const [query, setQuery] = useState('');
  const [activePanel, setActivePanel] = useState<RssSidePanel>(null);
  const [sourceMenu, setSourceMenu] = useState<RssSourceMenuState | null>(null);
  const [itemMenu, setItemMenu] = useState<RssItemMenuState | null>(null);
  const [digestSettingsVisible, setDigestSettingsVisible] = useState(false);
  const [mobileLayout, setMobileLayout] = useState(
    () => window.matchMedia('(max-width: 800px)').matches,
  );
  const [compactLayout, setCompactLayout] = useState(
    () => window.matchMedia('(max-width: 700px)').matches,
  );
  useEffect(() => {
    const media = window.matchMedia('(max-width: 800px)');
    const update = () => setMobileLayout(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 700px)');
    const update = () => setCompactLayout(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  const navigation = useRssPageNavigation({
    dailyDigests,
    feeds,
    items,
    mobileLayout,
    query,
    setActivePanel,
    updateRssItem,
  });
  useEffect(() => {
    if (!sourceMenu && !itemMenu) return undefined;
    const close = () => {
      setSourceMenu(null);
      setItemMenu(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (
        event.target instanceof Element &&
        event.target.closest('.semi-dropdown-menu, .rss-context-menu')
      )
        return;
      close();
    };
    document.addEventListener('keydown', onKeyDown, true);
    document.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [itemMenu, sourceMenu]);

  const { selectedFeedId, feedById, filteredItems } = navigation;
  const selectedSourceTitle =
    selectedFeedId === 'daily'
      ? '日报'
      : selectedFeedId === 'all'
        ? '全部订阅'
        : selectedFeedId === 'unread'
          ? '未读内容'
          : selectedFeedId === 'bookmarked'
            ? '我的收藏'
            : (feedById.get(selectedFeedId)?.title ?? '订阅内容');
  const unreadVisibleItems = filteredItems.filter((item) => !item.readAt);

  const sources = useSourcesState({ setSourceMenu, setItemMenu });
  const { setTranslationVisible, ...article } = useArticleState({
    changeMobilePanel: navigation.changeMobilePanel,
    isSelectedVideo: navigation.isSelectedVideo,
    mobileLayout,
    query,
    selectedFeed: navigation.selectedFeed,
    selectedItem: navigation.selectedItem,
    selectedItemId: navigation.selectedItemId,
    selectedItemIdRef: navigation.selectedItemIdRef,
    selectedVideoPresentation: navigation.selectedVideoPresentation,
    setActivePanel,
  });
  // Register article reset effects before task effects, matching the original page lifecycle.
  const tasks = useRssTasks({
    isSelectedVideo: navigation.isSelectedVideo,
    selectedItem: navigation.selectedItem,
    selectedItemId: navigation.selectedItemId,
    selectedItemIdRef: navigation.selectedItemIdRef,
    hasSelectedTranslation: navigation.hasSelectedTranslation,
    selectedDigest: navigation.selectedDigest,
    todayKey: navigation.todayKey,
    setTranslationVisible,
  });
  return {
    navigation: {
      query: query,
      setQuery: setQuery,
      setSelectedItemId: navigation.setSelectedItemId,
      compactLayout: compactLayout,
      mobileLayout: mobileLayout,
      selectedDigest: navigation.selectedDigest,
      selectedItem: navigation.selectedItem,
      hasSelectedTranslation: navigation.hasSelectedTranslation,
      isSelectedVideo: navigation.isSelectedVideo,
      selectedFeed: navigation.selectedFeed,
      selectedVideoPresentation: navigation.selectedVideoPresentation,
      markAutomaticallySelectedItemRead: navigation.markAutomaticallySelectedItemRead,
      activePanel: activePanel,
      todayKey: navigation.todayKey,
      setDigestSettingsVisible: setDigestSettingsVisible,
      filteredItems: navigation.filteredItems,
      setActivePanel: setActivePanel,
      digestSettingsVisible: digestSettingsVisible,
      digestList: navigation.digestList,
      searchPreviews: navigation.searchPreviews,
      selectedFeedId: navigation.selectedFeedId,
      timeRange: navigation.timeRange,
      todayItems: navigation.todayItems,
      openDigest: navigation.openDigest,
      openItem: navigation.openItem,
      setSourceMenu: setSourceMenu,
      setItemMenu: setItemMenu,
      selectRange: navigation.setTimeRange,
      itemMenu: itemMenu,
      selectedSourceTitle: selectedSourceTitle,
      unreadVisibleItems: unreadVisibleItems,
      mobilePanel: navigation.mobilePanel,
      changeMobilePanel: navigation.changeMobilePanel,
      nextItem: navigation.nextItem,
      previousItem: navigation.previousItem,
      showMobileItems: navigation.showMobileItems,
      showMobileSources: navigation.showMobileSources,
      mobileView: navigation.mobileView,
      sourceMenu: sourceMenu,
      selectSource: navigation.selectSource,
      setSelectedFeedId: navigation.setSelectedFeedId,
    },
    sources,
    article,
    tasks,
  };
}
