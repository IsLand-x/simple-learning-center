import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { Allotment } from 'allotment';
import { useNavigate } from 'react-router-dom';
import {
  type DragStart,
  type DropResult,
  type DragUpdate,
  type ResponderProvided,
} from '@hello-pangea/dnd';
import {
  Button,
  Empty,
  Input,
  Toast,
  Tooltip,
  Typography,
} from '@douyinfe/semi-ui';
import {
  IconColorPalette,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconSetting,
} from '@douyinfe/semi-icons';
import { RssDigestSettingsSheet } from '../components/RssDigestSettingsSheet';
import { ReaderSelectionOverlays } from '../components/ReaderSelectionOverlays';
import { ReaderStylePanel } from '../components/ReaderToolbar';
import {
  RssMobileWorkspace,
} from '../components/RssMobileWorkspace';
import { clamp } from '../lib/format';
import { extractRssContentHeadings, removeRssLeadingCover, sanitizeRssContentHtml } from '../lib/rssContent';
import { ensureReaderFontStylesheet, READER_FONT_STACKS } from '../lib/readerFonts';
import { getReaderTextureStyle, resolveReaderStyle } from '../lib/readerThemes';
import { synchronizeLearningState } from '../lib/learningStateSync';
import { importYouTubeVideo } from '../lib/youtubeVideos';
import { useLearningStore } from '../store/useLearningStore';
import type { VideoResource } from '../types';
import {
  RSS_FEED_DRAG_PREFIX,
  RSS_FEED_DRAG_TYPE,
  RSS_FOLDER_DRAG_PREFIX,
  RSS_FOLDER_DRAG_TYPE,
  digestDateLabel,
  folderIdFromFeedsDroppable,
  type RssSidePanel,
  type TimeRange,
} from '../features/rss/model/rssPageModel';
import { exportOpml } from '../features/rss/application/rssOpml';
import { useRssAutoSummary, useRssTranslation } from '../features/rss/application/useRssAiTasks';
import { useRssPageNavigation } from '../features/rss/application/useRssPageNavigation';
import { useRssArticleAnnotations } from '../features/rss/application/useRssArticleAnnotations';
import { useRssSourceOperations } from '../features/rss/application/useRssSourceOperations';
import { useRssDigestTask } from '../features/rss/application/useRssDigestTask';
import {
  RssArticleToc,
  RssDigestArticle,
  RssImageViewer,
  RssItemArticle,
  RssRightPanel,
} from '../features/rss/ui/RssPresentation';
import { RssItemList, RssSourceTree } from '../features/rss/ui/RssNavigation';
import {
  RssAddSourceDialog,
  RssCreateFolderDialog,
  RssItemContextMenu,
  RssManageSourcesSheet,
  RssSourceContextMenu,
  type RssItemMenuState,
  type RssSourceMenuState,
} from '../features/rss/ui/RssDialogs';
import {
  RssActivityRail,
  RssDetailToolbar,
  RssItemListHeaderActions,
  RssMobileDetailActions,
  RssSourceActions,
} from '../features/rss/ui/RssToolbars';

const { Text, Title } = Typography;
type CssVariables = CSSProperties & Record<`--${string}`, string | number>;

export function RssPage() {
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
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => new Set(folders.map((folder) => folder.id)));
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
  const [mobileLayout, setMobileLayout] = useState(() => window.matchMedia('(max-width: 800px)').matches);
  const [compactLayout, setCompactLayout] = useState(() => window.matchMedia('(max-width: 700px)').matches);
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
  const folderFeeds = useMemo(() => new Map(folders.map((folder) => [
    folder.id,
    feeds.filter((feed) => feed.folderId === folder.id),
  ])), [feeds, folders]);
  const unfiledFeeds = feeds.filter((feed) => !feed.folderId || !folders.some((folder) => folder.id === feed.folderId));
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
  const readerStyle = useMemo(() => resolveReaderStyle(readerPreferences), [readerPreferences]);
  const articleStyle = useMemo(() => ({
    ...getReaderTextureStyle(readerStyle.texture, readerStyle.isDark),
    backgroundColor: readerStyle.paperColor,
    color: readerStyle.textColor,
    fontFamily: READER_FONT_STACKS[readerStyle.fontFamily],
    fontSize: `${readerStyle.fontSize}px`,
    lineHeight: readerStyle.density.lineHeight,
    letterSpacing: readerStyle.density.letterSpacing,
    '--rss-reader-accent-color': readerStyle.accentColor,
    '--rss-reader-callout-color': readerStyle.calloutColor,
    '--rss-reader-muted-color': readerStyle.mutedTextColor,
    '--rss-reader-paragraph-spacing': `${readerStyle.density.paragraphSpacing}em`,
    '--rss-reader-text-color': readerStyle.textColor,
  } as CssVariables), [readerStyle]);
  const articleTocStyle = useMemo(() => ({
    '--rss-toc-accent-color': readerStyle.accentColor,
    '--rss-toc-callout-color': readerStyle.calloutColor,
    '--rss-toc-muted-color': readerStyle.mutedTextColor,
    '--rss-toc-paper-color': readerStyle.paperColor,
    '--rss-toc-text-color': readerStyle.textColor,
  } as CssVariables), [readerStyle]);
  const articleBaseUrl = selectedItem?.fullContentUrl || selectedItem?.link || selectedFeed?.siteUrl || selectedFeed?.url || window.location.href;
  const selectedContent = isSelectedVideo
    ? selectedItem?.contentHtml || selectedItem?.contentText
    : selectedItem?.fullContentHtml || selectedItem?.contentHtml || selectedItem?.fullContentText || selectedItem?.contentText;
  const sanitizedContentHtml = useMemo(() => removeRssLeadingCover(sanitizeRssContentHtml(
    selectedContent,
    articleBaseUrl,
    query,
    selectedAnnotations,
  ), selectedVideoPresentation?.embedUrl ? selectedVideoPresentation.imageUrl : undefined), [articleBaseUrl, query, selectedAnnotations, selectedContent, selectedVideoPresentation?.embedUrl, selectedVideoPresentation?.imageUrl]);
  const sanitizedContentMarkup = useMemo(() => ({ __html: sanitizedContentHtml }), [sanitizedContentHtml]);
  const articleHeadings = useMemo(() => extractRssContentHeadings(sanitizedContentHtml), [sanitizedContentHtml]);
  const sanitizedTranslationHtml = useMemo(() => sanitizeRssContentHtml(
    selectedItem?.aiTranslationHtml,
    articleBaseUrl,
    query,
  ), [articleBaseUrl, query, selectedItem?.aiTranslationHtml]);
  const sanitizedTranslationMarkup = useMemo(() => ({ __html: sanitizedTranslationHtml }), [sanitizedTranslationHtml]);
  const translationHeadings = useMemo(() => extractRssContentHeadings(sanitizedTranslationHtml), [sanitizedTranslationHtml]);
  const displayedArticleHeadings = useMemo(() => (
    isSelectedVideo
      ? []
      : translationVisible && sanitizedTranslationHtml
      ? translationHeadings
      : translationVisible ? [] : articleHeadings
  ), [articleHeadings, isSelectedVideo, sanitizedTranslationHtml, translationHeadings, translationVisible]);

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
      if (event.target instanceof Element && event.target.closest('.semi-dropdown-menu, .rss-context-menu')) return;
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
      const imported = await importYouTubeVideo(selectedItem.link);
      const existing = videoResources.find((video) => video.youtubeVideoId === imported.youtubeVideoId);
      const timestamp = Date.now();
      const video: VideoResource = {
        ...imported,
        id: existing?.id ?? imported.youtubeVideoId,
        ...(existing?.lastPositionSeconds ? { lastPositionSeconds: existing.lastPositionSeconds } : {}),
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
  const translationStatus = selectedTranslationTask?.status
    ?? (hasSelectedTranslation ? 'ready' : 'idle');
  const translationError = selectedTranslationTask?.error ?? '';

  const { digestError, digestGenerating, runDigest } = useRssDigestTask({
    selectedDigestDate: selectedDigest?.date,
    todayKey,
  });

  const selectRange = (range: TimeRange) => {
    setTimeRange(range);
  };

  const handleSourceDragStart = (start: DragStart, provided: ResponderProvided) => {
    setSourceMenu(null);
    setItemMenu(null);
    if (start.type === RSS_FOLDER_DRAG_TYPE) {
      const folderId = start.draggableId.slice(RSS_FOLDER_DRAG_PREFIX.length);
      const folder = folders.find((item) => item.id === folderId);
      provided.announce(`已抓取文件夹“${folder?.name ?? '未命名文件夹'}”，使用方向键调整位置，空格键放下。`);
      return;
    }
    const feedId = start.draggableId.slice(RSS_FEED_DRAG_PREFIX.length);
    const feed = feeds.find((item) => item.id === feedId);
    provided.announce(`已抓取订阅源“${feed?.title ?? '未命名订阅源'}”，使用方向键调整位置或移动到文件夹，空格键放下。`);
  };

  const handleSourceDragUpdate = (update: DragUpdate, provided: ResponderProvided) => {
    if (!update.destination) {
      provided.announce('当前不在可放置区域。');
      return;
    }
    if (update.type === RSS_FOLDER_DRAG_TYPE) {
      provided.announce(`文件夹将移动到第 ${update.destination.index + 1} 位。`);
      return;
    }
    const folderId = folderIdFromFeedsDroppable(update.destination.droppableId);
    if (folderId === null) return;
    const destinationName = folderId
      ? folders.find((folder) => folder.id === folderId)?.name ?? '未命名文件夹'
      : '未分类';
    provided.announce(`订阅源将移动到“${destinationName}”的第 ${update.destination.index + 1} 位。`);
  };

  const handleSourceDragEnd = (result: DropResult, provided: ResponderProvided) => {
    const { destination, draggableId, source, type } = result;
    if (!destination) {
      provided.announce('已取消拖动。');
      return;
    }

    if (type === RSS_FOLDER_DRAG_TYPE) {
      if (source.index === destination.index) {
        provided.announce('文件夹位置未改变。');
        return;
      }
      const folderId = draggableId.slice(RSS_FOLDER_DRAG_PREFIX.length);
      const folder = folders.find((item) => item.id === folderId);
      const remainingFolders = folders.filter((item) => item.id !== folderId);
      moveRssFolder(folderId, remainingFolders[destination.index]?.id);
      provided.announce(`已将文件夹“${folder?.name ?? '未命名文件夹'}”移动到第 ${destination.index + 1} 位。`);
      return;
    }

    if (type !== RSS_FEED_DRAG_TYPE) return;
    const destinationFolderId = folderIdFromFeedsDroppable(destination.droppableId);
    if (destinationFolderId === null) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) {
      provided.announce('订阅源位置未改变。');
      return;
    }

    const feedId = draggableId.slice(RSS_FEED_DRAG_PREFIX.length);
    const feed = feeds.find((item) => item.id === feedId);
    const destinationFolder = destinationFolderId
      ? folders.find((item) => item.id === destinationFolderId)
      : undefined;
    if (!feed || (destinationFolderId && !destinationFolder)) return;

    const destinationFeeds = (destinationFolderId
      ? folderFeeds.get(destinationFolderId) ?? []
      : unfiledFeeds).filter((item) => item.id !== feedId);
    moveRssFeed(feedId, destinationFolderId, destinationFeeds[destination.index]?.id);
    if (destinationFolderId) {
      setExpandedFolders((current) => new Set(current).add(destinationFolderId));
    }

    const destinationName = destinationFolder?.name ?? '未分类';
    if ((feed.folderId ?? undefined) !== destinationFolderId) {
      Toast.success(`已将“${feed.title}”移到“${destinationName}”`);
    }
    provided.announce(`已将订阅源“${feed.title}”放到“${destinationName}”的第 ${destination.index + 1} 位。`);
  };

  const selectedSourceTitle = selectedFeedId === 'daily'
    ? '日报'
    : selectedFeedId === 'all'
      ? '全部订阅'
    : selectedFeedId === 'unread'
      ? '未读内容'
      : selectedFeedId === 'bookmarked'
        ? '我的收藏'
        : feedById.get(selectedFeedId)?.title ?? '订阅内容';
  const unreadVisibleItems = filteredItems.filter((item) => !item.readAt);

  const sourceActions = (
    <RssSourceActions
      feeds={feeds}
      folders={folders}
      visible={sourceActionsVisible}
      onExport={exportOpml}
      onImport={() => opmlInputRef.current?.click()}
      onManage={() => setManageVisible(true)}
      onMarkAllRead={() => markRssItemsRead()}
      onRefreshAll={() => void refreshFeeds(feeds)}
      onVisibleChange={setSourceActionsVisible}
    />
  );

  const sourceListContent = (
    <RssSourceTree
      dailyDigestCount={dailyDigests.length}
      expandedFolders={expandedFolders}
      folderFeeds={folderFeeds}
      folders={folders}
      itemCount={items.length}
      refreshingIds={refreshingIds}
      selectedFeedId={selectedFeedId}
      totalBookmarked={totalBookmarked}
      totalUnread={totalUnread}
      unfiledFeeds={unfiledFeeds}
      unreadByFeed={unreadByFeed}
      onChangeExpandedFolders={setExpandedFolders}
      onClearItemMenu={() => setItemMenu(null)}
      onCreateFolder={() => setFolderVisible(true)}
      onDragStart={handleSourceDragStart}
      onDragUpdate={handleSourceDragUpdate}
      onDragEnd={handleSourceDragEnd}
      onOpenSourceMenu={(feed, x, y) => setSourceMenu({ feed, x, y })}
      onSelectSource={selectSource}
    />
  );

  const itemsContent = (
    <RssItemList
      dailyDigests={digestList}
      feeds={feeds}
      filteredItems={filteredItems}
      query={query}
      searchPreviews={searchPreviews}
      selectedDigestId={selectedDigest?.id}
      selectedFeedId={selectedFeedId}
      selectedItemId={selectedItem?.id}
      timeRange={timeRange}
      todayItemsCount={todayItems.length}
      todayKey={todayKey}
      onOpenDigest={openDigest}
      onOpenItem={openItem}
      onOpenItemMenu={(item, x, y) => {
        setSourceMenu(null);
        setItemMenu({ item, x, y });
      }}
      onSelectRange={selectRange}
    />
  );

  const selectedItemDetailStatus = selectedItem
    ? isSelectedVideo
      ? selectedItem.readAt ? '已读 · 视频' : '未读 · 视频'
      : `${selectedItem.readAt ? '已读' : '未读'} · ${summaryStatus === 'ready' ? 'AI 已总结' : summaryStatus === 'generating' ? 'AI 总结中' : '等待摘要'}`
    : '未选择内容';
  const translationActionLabel = translationVisible
    ? '显示原文'
    : hasSelectedTranslation
      ? '显示中文翻译'
      : isSelectedVideo
        ? sanitizedContentHtml ? '翻译视频简介' : '没有可翻译的视频简介'
        : '翻译当前页面';

  const articleContent = selectedDigest ? (
    <RssDigestArticle
      date={selectedDigest.date}
      digest={selectedDigest.content ? selectedDigest : undefined}
      error={digestError}
      feeds={feeds}
      generating={digestGenerating}
      items={items}
      style={articleStyle}
      onGenerate={() => void runDigest(selectedDigest.date)}
    />
  ) : selectedItem ? (
    <RssItemArticle
      articleBodyRef={articleBodyRef}
      articleRef={articleRef}
      hasTranslation={hasSelectedTranslation}
      isVideo={isSelectedVideo}
      item={selectedItem}
      query={query}
      sanitizedContentHtml={sanitizedContentHtml}
      sanitizedContentMarkup={sanitizedContentMarkup}
      sanitizedTranslationHtml={sanitizedTranslationHtml}
      sanitizedTranslationMarkup={sanitizedTranslationMarkup}
      source={selectedFeed}
      style={articleStyle}
      summaryError={summaryError}
      summaryStatus={summaryStatus}
      translationError={translationError}
      translationStatus={translationStatus}
      translationVisible={translationVisible}
      videoPresentation={selectedVideoPresentation}
      onContentClick={handleArticleContentClick}
      onContentKeyDown={handleArticleContentKeyDown}
      onScroll={(event) => {
        markAutomaticallySelectedItemRead(event.currentTarget);
        setRssSelection(null);
        setActiveAnnotationTarget(null);
        syncActiveHeading(event.currentTarget);
        const title = event.currentTarget.querySelector<HTMLElement>('.rss-article__title');
        if (!title) return;
        setShowScrolledTitle(title.offsetTop + title.offsetHeight <= event.currentTarget.scrollTop + 12);
      }}
    />
  ) : (
    <div className="rss-article-empty">
      <Empty title="选择一条订阅内容" description="内容详情、收藏和 AI 摘要会显示在这里" />
    </div>
  );

  return (
    <main className="rss-page">
      {mobileLayout ? (
        <RssMobileWorkspace
          activePanel={mobilePanel}
          articleFetching={Boolean(selectedItem && fetchingArticleIds.has(selectedItem.id))}
          bookmarked={Boolean(selectedItem?.bookmarkedAt)}
          canFetchArticle={Boolean(selectedItem?.link && !isSelectedVideo)}
          detailContent={articleContent}
          detailActions={selectedDigest || selectedItem ? (
            <RssMobileDetailActions
              articleFetching={Boolean(selectedItem && fetchingArticleIds.has(selectedItem.id))}
              digest={selectedDigest}
              digestGenerating={digestGenerating}
              feed={selectedFeed}
              hasContent={Boolean(sanitizedContentHtml)}
              isVideo={isSelectedVideo}
              item={selectedItem}
              translationActionLabel={translationActionLabel}
              translationGenerating={translationStatus === 'generating'}
              translationVisible={translationVisible}
              videoImporting={videoImporting}
              onFetchArticle={(item) => void fetchArticleContent(item)}
              onImportVideo={() => void importSelectedYouTubeVideo()}
              onOpenDigestSettings={() => setDigestSettingsVisible(true)}
              onOpenOriginal={(url) => window.open(url, '_blank', 'noopener,noreferrer')}
              onRegenerateDigest={(date) => void runDigest(date)}
              onToggleBookmark={(item) => updateRssItem(item.id, { bookmarkedAt: item.bookmarkedAt ? undefined : Date.now() })}
              onTranslate={() => void translateCurrentPage()}
            />
          ) : undefined}
          detailIsDigest={Boolean(selectedDigest)}
          detailStatus={selectedDigest
            ? `${selectedDigest.date === todayKey ? '[正在产出中] ' : ''}${selectedDigest.itemCount} 条内容`
            : selectedItemDetailStatus}
          detailTitle={selectedDigest ? `${digestDateLabel(selectedDigest.date)}日报` : selectedItem?.title}
          hasOriginalLink={Boolean(selectedItem?.link)}
          hasNextItem={Boolean(nextItem)}
          hasPreviousItem={Boolean(previousItem)}
          itemCount={selectedFeedId === 'daily' ? digestList.length : filteredItems.length}
          itemCountUnit={selectedFeedId === 'daily' ? '天' : '条内容'}
          itemsContent={itemsContent}
          itemsActions={selectedFeedId === 'daily' ? (
            <>
              <Button aria-label="立即更新今天的日报" icon={<IconRefresh />} loading={digestGenerating} theme="borderless" type="tertiary" onClick={() => void runDigest(todayKey)} />
              <Button aria-label="打开日报设置" icon={<IconSetting />} theme="borderless" type="tertiary" onClick={() => setDigestSettingsVisible(true)} />
            </>
          ) : undefined}
          panelContent={mobilePanel === 'style' ? (
            <aside className="right-panel mobile-style-panel rss-mobile-style-panel" aria-label="阅读样式">
              <div className="panel-titlebar">
                <div className="panel-titlebar__title">
                  <IconColorPalette size="large" className="panel-tool-icon" />
                  <Text strong>阅读样式</Text>
                </div>
              </div>
              <div className="mobile-style-panel__body rss-mobile-style-panel__body">
                <ReaderStylePanel preferences={readerPreferences} onChangePreferences={setReaderPreferences} />
              </div>
            </aside>
          ) : mobilePanel ? (
            <RssRightPanel activePanel={mobilePanel} item={selectedItem} items={filteredItems} feeds={feeds} query={query} selectedText={aiQuote} onClearSelectedText={clearAiQuote} />
          ) : null}
          query={query}
          sourceActions={sourceActions}
          sourceTitle={selectedSourceTitle}
          sourcesContent={sourceListContent}
          totalUnread={totalUnread}
          unreadVisibleCount={unreadVisibleItems.length}
          view={mobileView}
          onAddSource={() => setAddVisible(true)}
          onBackToItems={showMobileItems}
          onBackToSources={showMobileSources}
          onChangePanel={changeMobilePanel}
          onChangeQuery={(value) => {
            setQuery(value);
            setSelectedItemId(null);
          }}
          onFetchArticle={() => {
            if (selectedItem) void fetchArticleContent(selectedItem);
          }}
          onMarkVisibleRead={() => markRssItemsRead(unreadVisibleItems.map((item) => item.id))}
          onOpenNextItem={() => {
            if (nextItem) openItem(nextItem);
          }}
          onOpenOriginal={() => {
            if (selectedItem?.link) window.open(selectedItem.link, '_blank', 'noopener,noreferrer');
          }}
          onOpenPreviousItem={() => {
            if (previousItem) openItem(previousItem);
          }}
          onToggleBookmark={() => {
            if (selectedItem) updateRssItem(selectedItem.id, { bookmarkedAt: selectedItem.bookmarkedAt ? undefined : Date.now() });
          }}
        />
      ) : (
        <>
          <header className="rss-page__header">
            <div className="rss-page__heading">
              <Title heading={5}>RSS</Title>
              <Text size="small" type="tertiary">{totalUnread} 条未读</Text>
            </div>
            <Input
              aria-label="搜索订阅内容"
              prefix={<IconSearch />}
              placeholder="搜索订阅内容"
              showClear
              value={query}
              onChange={(value) => {
                setQuery(value);
                setSelectedItemId(null);
              }}
              className="rss-search-input"
            />
          </header>

          <div className="rss-page__workspace">
        <Allotment className="rss-allotment" separator vertical={compactLayout}>
          <Allotment.Pane minSize={compactLayout ? 120 : 160} preferredSize={compactLayout ? 180 : 220} maxSize={compactLayout ? 240 : 340}>
            <section className="rss-source-pane" aria-label="订阅源">
              <div className="rss-panel-header">
                <Text strong>订阅源</Text>
                {sourceActions}
                <Tooltip content="添加订阅源">
                  <Button aria-label="添加订阅源" icon={<IconPlus />} size="small" theme="borderless" type="tertiary" onClick={() => setAddVisible(true)} />
                </Tooltip>
              </div>
              {sourceListContent}
            </section>
          </Allotment.Pane>

          <Allotment.Pane minSize={compactLayout ? 160 : 190} preferredSize={compactLayout ? 220 : 320} maxSize={compactLayout ? 320 : 520}>
            <section className="rss-items-pane" aria-label="订阅内容列表">
              <div className="rss-panel-header">
                <Text strong ellipsis={{ showTooltip: true }}>{selectedSourceTitle}</Text>
                <Text size="small" type="tertiary">{selectedFeedId === 'daily' ? `${digestList.length} 天` : `${filteredItems.length} 条`}</Text>
                <RssItemListHeaderActions
                  daily={selectedFeedId === 'daily'}
                  digestGenerating={digestGenerating}
                  todayKey={todayKey}
                  unreadItemIds={unreadVisibleItems.map((item) => item.id)}
                  onGenerateDigest={(date) => void runDigest(date)}
                  onMarkRead={markRssItemsRead}
                  onOpenDigestSettings={() => setDigestSettingsVisible(true)}
                />
              </div>
              {itemsContent}
            </section>
          </Allotment.Pane>

          <Allotment.Pane minSize={compactLayout ? 240 : 300}>
            <section className="rss-detail-layout">
              <Allotment
                className="rss-detail-allotment"
                proportionalLayout={false}
                separator={Boolean(activePanel)}
                onDragEnd={(sizes) => {
                  if (activePanel && sizes[1]) setRssPanelWidth(clamp(sizes[1], compactLayout ? 280 : 320, 720));
                }}
              >
                <Allotment.Pane minSize={0}>
                  <div className="rss-detail-pane">
                    <RssDetailToolbar
                      articleFetching={Boolean(selectedItem && fetchingArticleIds.has(selectedItem.id))}
                      digest={selectedDigest}
                      digestGenerating={digestGenerating}
                      feed={selectedFeed}
                      hasContent={Boolean(sanitizedContentHtml)}
                      isVideo={isSelectedVideo}
                      item={selectedItem}
                      itemStatus={selectedItemDetailStatus}
                      query={query}
                      readerPreferences={readerPreferences}
                      showScrolledTitle={showScrolledTitle}
                      stylePopoverVisible={stylePopoverVisible}
                      todayKey={todayKey}
                      translationActionLabel={translationActionLabel}
                      translationGenerating={translationStatus === 'generating'}
                      translationVisible={translationVisible}
                      videoImporting={videoImporting}
                      onChangeReaderPreferences={setReaderPreferences}
                      onFetchArticle={(item) => void fetchArticleContent(item)}
                      onImportVideo={() => void importSelectedYouTubeVideo()}
                      onOpenDigestSettings={() => setDigestSettingsVisible(true)}
                      onOpenOriginal={(url) => window.open(url, '_blank', 'noopener,noreferrer')}
                      onRegenerateDigest={(date) => void runDigest(date)}
                      onStylePopoverVisibleChange={setStylePopoverVisible}
                      onToggleBookmark={(item) => updateRssItem(item.id, { bookmarkedAt: item.bookmarkedAt ? undefined : Date.now() })}
                      onTranslate={() => void translateCurrentPage()}
                    />
                    <div className="rss-article-workspace">
                      <RssArticleToc activeHeadingId={activeHeadingId} headings={displayedArticleHeadings} style={articleTocStyle} onSelect={jumpToHeading} />
                      {articleContent}
                    </div>
                  </div>
                </Allotment.Pane>
                <Allotment.Pane visible={Boolean(activePanel)} preferredSize={rssPanelWidth} minSize={compactLayout ? 280 : 320} maxSize={720}>
                  {activePanel && <RssRightPanel activePanel={activePanel} annotations={selectedAnnotations} item={selectedItem} items={filteredItems} feeds={feeds} query={query} selectedText={aiQuote} onClearSelectedText={clearAiQuote} onJumpAnnotation={jumpToAnnotation} />}
                </Allotment.Pane>
              </Allotment>

              {selectedItem && (
                <RssActivityRail
                  activePanel={activePanel}
                  onChange={(panel) => setActivePanel((current) => current === panel ? null : panel)}
                />
              )}
            </section>
          </Allotment.Pane>
            </Allotment>
          </div>
        </>
      )}

      <input ref={opmlInputRef} className="visually-hidden" type="file" accept=".opml,.xml,text/xml" onChange={(event) => void importOpml(event)} />

      <RssDigestSettingsSheet
        configs={configs}
        runs={digestRuns}
        settings={digestSettings}
        visible={digestSettingsVisible}
        onCancel={() => setDigestSettingsVisible(false)}
        onSave={(settings) => {
          setRssDigestSettings(settings);
          setDigestSettingsVisible(false);
          Toast.success(settings.enabled ? '日报定时任务已开启' : '日报设置已保存');
        }}
      />

      <RssAddSourceDialog
        feedFolderId={feedFolderId}
        feedTitle={feedTitle}
        feedType={feedType}
        feedUrl={feedUrl}
        folders={folders}
        sourceKind={sourceKind}
        submitting={submitting}
        visible={addVisible}
        onCancel={() => setAddVisible(false)}
        onChangeFeedFolderId={setFeedFolderId}
        onChangeFeedTitle={setFeedTitle}
        onChangeFeedType={setFeedType}
        onChangeFeedUrl={setFeedUrl}
        onChangeSourceKind={(kind) => {
          setSourceKind(kind);
          setFeedUrl('');
        }}
        onSubmit={(event) => void addSubscription(event)}
      />

      <RssCreateFolderDialog
        folderName={folderName}
        visible={folderVisible}
        onCancel={() => setFolderVisible(false)}
        onChangeFolderName={setFolderName}
        onSubmit={createFolder}
      />

      <RssManageSourcesSheet
        feeds={feeds}
        folders={folders}
        mobileLayout={mobileLayout}
        visible={manageVisible}
        onChangeFeedFolder={(feed, folderId) => updateRssFeed(feed.id, { folderId })}
        onChangeFeedType={(feed, type) => updateRssFeed(feed.id, { type })}
        onClose={() => setManageVisible(false)}
        onCreateFolder={() => {
          setManageVisible(false);
          setFolderVisible(true);
        }}
        onDeleteFeed={confirmDeleteFeed}
        onDeleteFolder={confirmDeleteFolder}
        onRenameFolder={(folder, name) => updateRssFolder(folder.id, { name })}
        onToggleFullContent={(feed, checked) => updateRssFeed(feed.id, { fetchFullContent: checked })}
      />

      <RssImageViewer image={imageViewer} onClose={() => setImageViewer(null)} />

      <ReaderSelectionOverlays
        activeHighlight={activeAnnotation}
        activeHighlightTarget={activeAnnotationTarget}
        commentDraft={commentDraft}
        commentingHighlightId={commentingAnnotationId}
        pendingCommentSelection={pendingCommentSelection}
        selection={rssSelection}
        showViewHighlight={false}
        onAskAboutSelection={askAboutRssSelection}
        onCancelCommentEditing={cancelCommentEditing}
        onCancelHighlight={deleteActiveAnnotation}
        onChangeCommentDraft={setCommentDraft}
        onCreateComment={createRssComment}
        onEditHighlightComment={editAnnotationComment}
        onSaveHighlight={saveRssHighlight}
        onSaveHighlightComment={saveRssComment}
        onViewHighlight={() => undefined}
      />

      <RssSourceContextMenu
        items={items}
        menu={sourceMenu}
        onClose={() => setSourceMenu(null)}
        onDelete={confirmDeleteFeed}
        onManage={() => setManageVisible(true)}
        onMarkRead={markRssItemsRead}
        onRefresh={(feed) => void refreshFeed(feed)}
      />

      <RssItemContextMenu
        menu={itemMenu}
        onClose={() => setItemMenu(null)}
        onMarkRead={(item) => markRssItemsRead([item.id])}
        onMarkUnread={(item) => markRssItemsUnread([item.id])}
        onToggleBookmark={(item) => updateRssItem(item.id, {
          bookmarkedAt: item.bookmarkedAt ? undefined : Date.now(),
        })}
      />
    </main>
  );
}
