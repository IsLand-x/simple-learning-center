import { videosApi } from '../../../../api/videos';
import { Toast } from '@douyinfe/semi-ui';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { synchronizeLearningState } from '../../../../util/state/learningStateSync';
import { ensureReaderFontStylesheet } from '../../../../util/reading/readerFonts';
import { useLearningStore } from '../../../../util/state/useLearningStore';
import type { VideoResource } from '../../../../types/domain';

import { type RssItemMenuState, type RssSourceMenuState } from './menuTypes';
import { type RssSidePanel, type TimeRange } from './model/rssPageModel';
import { useRssAutoSummary, useRssTranslation } from './useRssAiTasks';
import { useRssArticleAnnotations } from './useRssArticleAnnotations';
import { useRssDigestTask } from './useRssDigestTask';
import { useRssPageNavigation } from './useRssPageNavigation';
import { useRssSourceOperations } from './useRssSourceOperations';
import { createRssSourceDragHandlers } from './sourceDrag';
import { useRssArticlePresentation } from './useRssArticlePresentation';

export function useRssPageStore() {
  const navigate = useNavigate();
  const folders = useLearningStore((state) => state.rssFolders);
  const feeds = useLearningStore((state) => state.rssFeeds);
  const items = useLearningStore((state) => state.rssItems);
  const annotations = useLearningStore((state) => state.rssAnnotations);
  const dailyDigests = useLearningStore((state) => state.rssDailyDigests);
  const digestRuns = useLearningStore((state) => state.rssDigestRuns);
  const digestSettings = useLearningStore((state) => state.rssDigestSettings);
  const configs = useLearningStore((state) => state.openAIConfigs);
  const aiPreferences = useLearningStore((state) => state.aiPreferences);
  const readerPreferences = useLearningStore((state) => state.readerPreferences);
  const videoResources = useLearningStore((state) => state.videoResources);
  const updateRssFolder = useLearningStore((state) => state.updateRssFolder);
  const moveRssFolder = useLearningStore((state) => state.moveRssFolder);
  const updateRssFeed = useLearningStore((state) => state.updateRssFeed);
  const moveRssFeed = useLearningStore((state) => state.moveRssFeed);
  const updateRssItem = useLearningStore((state) => state.updateRssItem);
  const addRssAnnotation = useLearningStore((state) => state.addRssAnnotation);
  const updateRssAnnotation = useLearningStore((state) => state.updateRssAnnotation);
  const deleteRssAnnotation = useLearningStore((state) => state.deleteRssAnnotation);
  const setRssDigestSettings = useLearningStore((state) => state.setRssDigestSettings);
  const markRssItemsRead = useLearningStore((state) => state.markRssItemsRead);
  const markRssItemsUnread = useLearningStore((state) => state.markRssItemsUnread);
  const upsertVideoResource = useLearningStore((state) => state.upsertVideoResource);
  const rssPanelWidth = useLearningStore((state) => state.rssPanelWidth);
  const setRssPanelWidth = useLearningStore((state) => state.setRssPanelWidth);
  const setReaderPreferences = useLearningStore((state) => state.setReaderPreferences);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    () => new Set(folders.map((folder) => folder.id)),
  );
  const [query, setQuery] = useState('');
  const [activePanel, setActivePanel] = useState<RssSidePanel>(null);
  const [addVisible, setAddVisible] = useState(false);
  const [folderVisible, setFolderVisible] = useState(false);
  const [manageVisible, setManageVisible] = useState(false);
  const [sourceActionsVisible, setSourceActionsVisible] = useState(false);
  const [videoImporting, setVideoImporting] = useState(false);
  const [translationVisible, setTranslationVisible] = useState(false);
  const [digestSettingsVisible, setDigestSettingsVisible] = useState(false);
  const [sourceMenu, setSourceMenu] = useState<RssSourceMenuState | null>(null);
  const [itemMenu, setItemMenu] = useState<RssItemMenuState | null>(null);
  const [showScrolledTitle, setShowScrolledTitle] = useState(false);
  const [stylePopoverVisible, setStylePopoverVisible] = useState(false);
  const [mobileLayout, setMobileLayout] = useState(
    () => window.matchMedia('(max-width: 800px)').matches,
  );
  const [compactLayout, setCompactLayout] = useState(
    () => window.matchMedia('(max-width: 700px)').matches,
  );
  const opmlInputRef = useRef<HTMLInputElement>(null);
  const articleRef = useRef<HTMLElement>(null);
  const articleBodyRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    let disposed = false;
    let syncing = false;
    const syncScheduledContent = async () => {
      if (disposed || syncing || document.visibilityState === 'hidden') return;
      syncing = true;
      try {
        if (!disposed) await synchronizeLearningState();
      } catch (error) {
        console.warn('无法同步服务端 RSS 更新', error);
      } finally {
        syncing = false;
      }
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void syncScheduledContent();
    };
    const timer = window.setInterval(() => void syncScheduledContent(), 60_000);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  useEffect(() => {
    setExpandedFolders((current) => {
      const next = new Set(current);
      folders.forEach((folder) => next.add(folder.id));
      return next;
    });
  }, [folders]);

  const unreadByFeed = useMemo(() => {
    const counts = new Map<string, number>();
    items.forEach((item) => {
      if (!item.readAt) counts.set(item.feedId, (counts.get(item.feedId) ?? 0) + 1);
    });
    return counts;
  }, [items]);
  const totalUnread = items.filter((item) => !item.readAt).length;
  const totalBookmarked = items.filter((item) => item.bookmarkedAt).length;
  const folderFeeds = useMemo(
    () =>
      new Map(
        folders.map((folder) => [folder.id, feeds.filter((feed) => feed.folderId === folder.id)]),
      ),
    [feeds, folders],
  );
  const unfiledFeeds = feeds.filter(
    (feed) => !feed.folderId || !folders.some((folder) => folder.id === feed.folderId),
  );
  const {
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
  } = useRssPageNavigation({
    dailyDigests,
    feeds,
    items,
    mobileLayout,
    query,
    setActivePanel,
    updateRssItem,
  });
  const selectedAnnotations = useMemo(
    () => annotations.filter((annotation) => annotation.itemId === selectedItemId),
    [annotations, selectedItemId],
  );
  const {
    readerStyle,
    articleStyle,
    articleTocStyle,
    sanitizedContentHtml,
    sanitizedContentMarkup,
    sanitizedTranslationHtml,
    sanitizedTranslationMarkup,
    displayedArticleHeadings,
  } = useRssArticlePresentation({
    readerPreferences,
    selectedItem,
    selectedFeed,
    selectedAnnotations,
    query,
    isSelectedVideo,
    translationVisible,
    selectedVideoPresentation,
  });

  useEffect(() => {
    setShowScrolledTitle(false);
    setTranslationVisible(false);
  }, [selectedItem?.id]);

  const {
    activeAnnotation,
    activeAnnotationTarget,
    activeHeadingId,
    aiQuote,
    askAboutRssSelection,
    cancelCommentEditing,
    clearAiQuote,
    commentDraft,
    commentingAnnotationId,
    createRssComment,
    deleteActiveAnnotation,
    editAnnotationComment,
    handleArticleContentClick,
    handleArticleContentKeyDown,
    imageViewer,
    jumpToAnnotation,
    jumpToHeading,
    pendingCommentSelection,
    rssSelection,
    saveRssComment,
    saveRssHighlight,
    setActiveAnnotationTarget,
    setCommentDraft,
    setImageViewer,
    setRssSelection,
    syncActiveHeading,
  } = useRssArticleAnnotations({
    addRssAnnotation,
    articleBodyRef,
    changeMobilePanel,
    deleteRssAnnotation,
    displayedArticleHeadings,
    mobileLayout,
    selectedAnnotations,
    selectedItemId,
    setActivePanel,
    translationVisible,
    updateRssAnnotation,
  });

  useLayoutEffect(() => {
    if (!selectedItemId) return;
    const article = articleRef.current;
    if (!article) return;
    article.scrollTop = 0;
    article.scrollLeft = 0;
  }, [selectedItemId]);

  useEffect(() => {
    void ensureReaderFontStylesheet(document, readerStyle.fontFamily);
  }, [readerStyle.fontFamily]);

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

  const {
    addSubscription,
    confirmDeleteFeed,
    confirmDeleteFolder,
    createFolder,
    feedFolderId,
    feedTitle,
    feedType,
    feedUrl,
    fetchingArticleIds,
    fetchArticleContent,
    folderName,
    importOpml,
    refreshingIds,
    refreshFeed,
    refreshFeeds,
    setFeedFolderId,
    setFeedTitle,
    setFeedType,
    setFeedUrl,
    setFolderName,
    setSourceKind,
    sourceKind,
    submitting,
  } = useRssSourceOperations({
    feeds,
    folders,
    selectedItemIdRef,
    setExpandedFolders,
    setSelectedFeedId,
    onCloseAddDialog: () => setAddVisible(false),
    onCloseFolderDialog: () => setFolderVisible(false),
  });

  const importSelectedYouTubeVideo = async () => {
    if (!selectedItem || selectedFeed?.source.kind !== 'youtube-channel') return;
    setVideoImporting(true);
    try {
      const imported = await videosApi.importYouTubeVideo({ url: selectedItem.link });
      const existing = videoResources.find(
        (video) => video.youtubeVideoId === imported.youtubeVideoId,
      );
      const timestamp = Date.now();
      const video: VideoResource = {
        ...imported,
        id: existing?.id ?? imported.youtubeVideoId,
        ...(existing?.lastPositionSeconds
          ? { lastPositionSeconds: existing.lastPositionSeconds }
          : {}),
        createdAt: existing?.createdAt ?? timestamp,
        updatedAt: timestamp,
      };
      upsertVideoResource(video);
      Toast.success(existing ? '已更新学习区中的视频资料' : '已添加到视频学习区');
      navigate(`/videos?video=${encodeURIComponent(video.id)}`);
    } catch (error) {
      Toast.error(error instanceof Error ? error.message : '导入视频学习区失败');
    } finally {
      setVideoImporting(false);
    }
  };

  const { summaryError, summaryStatus } = useRssAutoSummary({
    aiPreferences,
    configs,
    isSelectedVideo,
    selectedItem,
    updateRssItem,
  });

  const { translateCurrentPage, translationTasks } = useRssTranslation({
    aiPreferences,
    configs,
    selectedItem,
    selectedItemIdRef,
    setTranslationVisible,
    updateRssItem,
  });
  const selectedTranslationTask = selectedItemId ? translationTasks[selectedItemId] : undefined;
  const translationStatus =
    selectedTranslationTask?.status ?? (hasSelectedTranslation ? 'ready' : 'idle');
  const translationError = selectedTranslationTask?.error ?? '';

  const { digestError, digestGenerating, runDigest } = useRssDigestTask({
    selectedDigestDate: selectedDigest?.date,
    todayKey,
  });

  const selectRange = (range: TimeRange) => {
    setTimeRange(range);
  };

  const { handleSourceDragStart, handleSourceDragUpdate, handleSourceDragEnd } =
    createRssSourceDragHandlers({
      feeds,
      folders,
      folderFeeds,
      unfiledFeeds,
      setSourceMenu,
      setItemMenu,
      setExpandedFolders,
      moveRssFolder,
      moveRssFeed,
    });

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
  return {
    feeds,
    folders,
    sourceActionsVisible,
    opmlInputRef,
    setManageVisible,
    markRssItemsRead,
    refreshFeeds,
    setSourceActionsVisible,
    dailyDigests,
    expandedFolders,
    folderFeeds,
    items,
    refreshingIds,
    selectedFeedId,
    totalBookmarked,
    totalUnread,
    unfiledFeeds,
    unreadByFeed,
    setExpandedFolders,
    setItemMenu,
    setFolderVisible,
    handleSourceDragStart,
    handleSourceDragUpdate,
    handleSourceDragEnd,
    setSourceMenu,
    selectSource,
    digestList,
    filteredItems,
    query,
    searchPreviews,
    selectedDigest,
    selectedItem,
    timeRange,
    todayItems,
    todayKey,
    openDigest,
    openItem,
    selectRange,
    isSelectedVideo,
    summaryStatus,
    translationVisible,
    hasSelectedTranslation,
    sanitizedContentHtml,
    digestError,
    digestGenerating,
    articleStyle,
    runDigest,
    articleBodyRef,
    articleRef,
    sanitizedContentMarkup,
    sanitizedTranslationHtml,
    sanitizedTranslationMarkup,
    selectedFeed,
    summaryError,
    translationError,
    translationStatus,
    selectedVideoPresentation,
    handleArticleContentClick,
    handleArticleContentKeyDown,
    markAutomaticallySelectedItemRead,
    setRssSelection,
    setActiveAnnotationTarget,
    syncActiveHeading,
    setShowScrolledTitle,
    mobileLayout,
    mobilePanel,
    fetchingArticleIds,
    videoImporting,
    fetchArticleContent,
    importSelectedYouTubeVideo,
    setDigestSettingsVisible,
    updateRssItem,
    translateCurrentPage,
    nextItem,
    previousItem,
    readerPreferences,
    setReaderPreferences,
    aiQuote,
    clearAiQuote,
    selectedSourceTitle,
    unreadVisibleItems,
    mobileView,
    setAddVisible,
    showMobileItems,
    showMobileSources,
    changeMobilePanel,
    setQuery,
    setSelectedItemId,
    compactLayout,
    activePanel,
    setRssPanelWidth,
    showScrolledTitle,
    stylePopoverVisible,
    setStylePopoverVisible,
    activeHeadingId,
    displayedArticleHeadings,
    articleTocStyle,
    jumpToHeading,
    rssPanelWidth,
    selectedAnnotations,
    jumpToAnnotation,
    setActivePanel,
    importOpml,
    configs,
    digestRuns,
    digestSettings,
    digestSettingsVisible,
    setRssDigestSettings,
    feedFolderId,
    feedTitle,
    feedType,
    feedUrl,
    sourceKind,
    submitting,
    addVisible,
    setFeedFolderId,
    setFeedTitle,
    setFeedType,
    setFeedUrl,
    setSourceKind,
    addSubscription,
    folderName,
    folderVisible,
    setFolderName,
    createFolder,
    manageVisible,
    updateRssFeed,
    confirmDeleteFeed,
    confirmDeleteFolder,
    updateRssFolder,
    imageViewer,
    setImageViewer,
    activeAnnotation,
    activeAnnotationTarget,
    commentDraft,
    commentingAnnotationId,
    pendingCommentSelection,
    rssSelection,
    askAboutRssSelection,
    cancelCommentEditing,
    deleteActiveAnnotation,
    setCommentDraft,
    createRssComment,
    editAnnotationComment,
    saveRssHighlight,
    saveRssComment,
    sourceMenu,
    refreshFeed,
    itemMenu,
    markRssItemsUnread,
  };
}
