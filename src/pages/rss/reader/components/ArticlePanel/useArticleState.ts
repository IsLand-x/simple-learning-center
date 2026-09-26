import { Toast } from '@douyinfe/semi-ui';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { VideoResource } from '../../../../../../contracts/videos';
import { videosApi } from '../../../../../api/videos';
import { useLearningStore } from '../../../../../store/useLearningStore';
import { ensureReaderFontStylesheet } from '../../../../../util/reading/readerFonts';

import { useRssArticleAnnotations } from './useRssArticleAnnotations';
import { useRssArticlePresentation } from './useRssArticlePresentation';

import type { MutableRefObject } from 'react';
import type { WorkspaceContextValue } from '../../store/workspaceTypes';
import { useFetchArticle } from './useFetchArticle';
type ArticleStateInput = Pick<
  WorkspaceContextValue['navigation'],
  | 'changeMobilePanel'
  | 'isSelectedVideo'
  | 'mobileLayout'
  | 'query'
  | 'selectedFeed'
  | 'selectedItem'
  | 'selectedVideoPresentation'
  | 'setActivePanel'
> & { selectedItemId: string | null; selectedItemIdRef: MutableRefObject<string | null> };
export function useArticleState({
  changeMobilePanel,
  isSelectedVideo,
  mobileLayout,
  query,
  selectedFeed,
  selectedItem,
  selectedVideoPresentation,
  setActivePanel,
  selectedItemId,
  selectedItemIdRef,
}: ArticleStateInput) {
  const navigate = useNavigate();
  const annotations = useLearningStore((state) => state.rssAnnotations);
  const readerPreferences = useLearningStore((state) => state.readerPreferences);
  const videoResources = useLearningStore((state) => state.videoResources);
  const addRssAnnotation = useLearningStore((state) => state.addRssAnnotation);
  const updateRssAnnotation = useLearningStore((state) => state.updateRssAnnotation);
  const deleteRssAnnotation = useLearningStore((state) => state.deleteRssAnnotation);
  const upsertVideoResource = useLearningStore((state) => state.upsertVideoResource);
  const [videoImporting, setVideoImporting] = useState(false);
  const [translationVisible, setTranslationVisible] = useState(false);
  const [showScrolledTitle, setShowScrolledTitle] = useState(false);
  const [stylePopoverVisible, setStylePopoverVisible] = useState(false);
  const articleRef = useRef<HTMLElement>(null);
  const articleBodyRef = useRef<HTMLDivElement>(null);
  const fetching = useFetchArticle(selectedItemIdRef);
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

  return {
    articleRef,
    articleBodyRef,
    selectedAnnotations,
    articleStyle,
    articleTocStyle,
    sanitizedContentHtml,
    sanitizedContentMarkup,
    sanitizedTranslationHtml,
    sanitizedTranslationMarkup,
    displayedArticleHeadings,
    videoImporting,
    importSelectedYouTubeVideo,
    translationVisible,
    setTranslationVisible,
    showScrolledTitle,
    setShowScrolledTitle,
    stylePopoverVisible,
    setStylePopoverVisible,
    ...fetching,
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
  };
}
