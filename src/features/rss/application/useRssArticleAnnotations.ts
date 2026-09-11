import {
  useCallback,
  useEffect,
  useState,
  type Dispatch,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type RefObject,
  type SetStateAction,
} from 'react';
import { Toast } from '@douyinfe/semi-ui';
import type { RssContentHeading } from '../../../lib/rssContent';
import { createUuid } from '../../../lib/uuid';
import type { ReaderHighlightTarget, ReaderSelection, RssAnnotation } from '../../../types';
import type { RssMobilePanel } from '../../../components/RssMobileWorkspace';
import type { RssImageViewerImage, RssSidePanel } from '../model/rssPageModel';

export interface RssReaderSelection extends ReaderSelection {
  startOffset: number;
  endOffset: number;
  prefix: string;
  suffix: string;
}

type AddRssAnnotation = (annotation: RssAnnotation) => void;
type UpdateRssAnnotation = (annotationId: string, changes: Partial<RssAnnotation>) => void;
type DeleteRssAnnotation = (annotationId: string) => void;

export function useRssArticleAnnotations({
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
}: {
  addRssAnnotation: AddRssAnnotation;
  articleBodyRef: RefObject<HTMLDivElement>;
  changeMobilePanel: (panel: RssMobilePanel) => void;
  deleteRssAnnotation: DeleteRssAnnotation;
  displayedArticleHeadings: RssContentHeading[];
  mobileLayout: boolean;
  selectedAnnotations: RssAnnotation[];
  selectedItemId: string | null;
  setActivePanel: Dispatch<SetStateAction<RssSidePanel>>;
  translationVisible: boolean;
  updateRssAnnotation: UpdateRssAnnotation;
}) {
  const [activeHeadingId, setActiveHeadingId] = useState<string>();
  const [imageViewer, setImageViewer] = useState<RssImageViewerImage | null>(null);
  const [rssSelection, setRssSelection] = useState<RssReaderSelection | null>(null);
  const [pendingCommentSelection, setPendingCommentSelection] = useState<RssReaderSelection | null>(
    null,
  );
  const [activeAnnotationTarget, setActiveAnnotationTarget] =
    useState<ReaderHighlightTarget | null>(null);
  const [commentingAnnotationId, setCommentingAnnotationId] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState('');
  const [aiQuote, setAiQuote] = useState<string | undefined>();
  const activeAnnotation = activeAnnotationTarget
    ? selectedAnnotations.find((annotation) => annotation.id === activeAnnotationTarget.highlightId)
    : undefined;

  useEffect(() => {
    setActiveHeadingId(undefined);
    setImageViewer(null);
    setRssSelection(null);
    setPendingCommentSelection(null);
    setActiveAnnotationTarget(null);
    setCommentingAnnotationId(null);
    setCommentDraft('');
    setAiQuote(undefined);
  }, [selectedItemId]);

  useEffect(() => {
    setActiveHeadingId(displayedArticleHeadings[0]?.id);
  }, [displayedArticleHeadings, selectedItemId]);

  useEffect(() => {
    if (translationVisible) {
      setRssSelection(null);
      return undefined;
    }
    const syncSelection = () => {
      const nativeSelection = window.getSelection();
      const body = articleBodyRef.current;
      if (
        !nativeSelection ||
        nativeSelection.rangeCount !== 1 ||
        nativeSelection.isCollapsed ||
        !body
      ) {
        setRssSelection(null);
        return;
      }
      const range = nativeSelection.getRangeAt(0);
      if (!body.contains(range.startContainer) || !body.contains(range.endContainer)) {
        setRssSelection(null);
        return;
      }
      const rawText = range.toString();
      const text = rawText.trim();
      if (!text) {
        setRssSelection(null);
        return;
      }
      const before = document.createRange();
      before.selectNodeContents(body);
      before.setEnd(range.startContainer, range.startOffset);
      const leadingWhitespace = rawText.length - rawText.trimStart().length;
      const trailingWhitespace = rawText.length - rawText.trimEnd().length;
      const startOffset = before.toString().length + leadingWhitespace;
      const endOffset = startOffset + rawText.length - leadingWhitespace - trailingWhitespace;
      const bodyText = body.textContent ?? '';
      const rect = range.getBoundingClientRect();
      if (!rect.width && !rect.height) return;
      setActiveAnnotationTarget(null);
      setRssSelection({
        text,
        cfi: `rss:${startOffset}:${endOffset}`,
        startOffset,
        endOffset,
        prefix: bodyText.slice(Math.max(0, startOffset - 32), startOffset),
        suffix: bodyText.slice(endOffset, endOffset + 32),
        rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      });
    };
    document.addEventListener('selectionchange', syncSelection);
    return () => document.removeEventListener('selectionchange', syncSelection);
  }, [articleBodyRef, selectedItemId, translationVisible]);

  const openContentImage = (target: EventTarget | null) => {
    if (!(target instanceof Element)) return false;
    const image = target.closest<HTMLImageElement>('img[data-rss-content-image="true"]');
    if (!image) return false;
    setImageViewer({ src: image.currentSrc || image.src, alt: image.alt || '文章图片' });
    return true;
  };

  const clearNativeSelection = () => {
    window.getSelection()?.removeAllRanges();
    setRssSelection(null);
  };

  const openAnnotationTarget = (target: EventTarget | null) => {
    if (!(target instanceof Element) || target.closest('a[href]')) return false;
    const marker = target.closest<HTMLElement>('[data-rss-annotation-id]');
    const annotationId = marker?.dataset.rssAnnotationId;
    if (
      !marker ||
      !annotationId ||
      !selectedAnnotations.some((annotation) => annotation.id === annotationId)
    )
      return false;
    const rect = marker.getBoundingClientRect();
    setRssSelection(null);
    setPendingCommentSelection(null);
    setCommentingAnnotationId(null);
    setActiveAnnotationTarget({
      highlightId: annotationId,
      rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
    });
    return true;
  };

  const syncActiveHeading = (article: HTMLElement) => {
    const headings = Array.from(
      article.querySelectorAll<HTMLElement>(
        '.rss-article__body h1[id], .rss-article__body h2[id], .rss-article__body h3[id]',
      ),
    );
    if (!headings.length) return;
    const articleTop = article.getBoundingClientRect().top + 96;
    const active = headings.reduce(
      (current, heading) => (heading.getBoundingClientRect().top <= articleTop ? heading : current),
      headings[0],
    );
    setActiveHeadingId((current) => (current === active.id ? current : active.id));
  };

  const jumpToHeading = (headingId: string) => {
    const heading = articleBodyRef.current?.querySelector<HTMLElement>(`#${headingId}`);
    if (!heading) return;
    setActiveHeadingId(headingId);
    heading.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const jumpToAnnotation = (annotation: RssAnnotation) => {
    const marker = articleBodyRef.current?.querySelector<HTMLElement>(
      `[data-rss-annotation-id="${annotation.id}"]`,
    );
    if (!marker) {
      Toast.warning('原文内容发生变化，暂时无法定位这条评论');
      return;
    }
    marker.scrollIntoView({ behavior: 'smooth', block: 'center' });
    marker.focus({ preventScroll: true });
  };

  const handleArticleContentClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (openContentImage(event.target)) return;
    if (openAnnotationTarget(event.target)) return;
    setActiveAnnotationTarget(null);
  };

  const handleArticleContentKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    if (!openContentImage(event.target) && !openAnnotationTarget(event.target)) return;
    event.preventDefault();
  };

  const addSelectionAnnotation = (
    selection: RssReaderSelection,
    kind: RssAnnotation['kind'],
    comment?: string,
  ) => {
    if (!selectedItemId) return false;
    const overlaps = selectedAnnotations.some(
      (annotation) =>
        selection.startOffset < annotation.endOffset &&
        selection.endOffset > annotation.startOffset,
    );
    if (overlaps) {
      Toast.info('这段内容已经包含高亮或评论');
      clearNativeSelection();
      return false;
    }
    addRssAnnotation({
      id: createUuid(),
      itemId: selectedItemId,
      kind,
      text: selection.text,
      startOffset: selection.startOffset,
      endOffset: selection.endOffset,
      prefix: selection.prefix,
      suffix: selection.suffix,
      ...(comment ? { comment, commentUpdatedAt: Date.now() } : {}),
      createdAt: Date.now(),
    });
    clearNativeSelection();
    return true;
  };

  const askAboutRssSelection = () => {
    if (!rssSelection) return;
    setAiQuote(rssSelection.text);
    if (mobileLayout) changeMobilePanel('ai');
    else setActivePanel('ai');
    clearNativeSelection();
  };

  const saveRssHighlight = () => {
    if (rssSelection && addSelectionAnnotation(rssSelection, 'highlight')) Toast.success('已高亮');
  };

  const createRssComment = () => {
    if (!rssSelection) return;
    setPendingCommentSelection(rssSelection);
    setCommentDraft('');
    clearNativeSelection();
  };

  const saveRssComment = () => {
    const comment = commentDraft.trim();
    if (pendingCommentSelection) {
      if (!comment) return;
      if (addSelectionAnnotation(pendingCommentSelection, 'comment', comment)) {
        setPendingCommentSelection(null);
        setCommentDraft('');
        if (!mobileLayout) setActivePanel('comments');
        Toast.success('评论已保存');
      }
      return;
    }
    if (!activeAnnotation) return;
    if (!comment && activeAnnotation.kind === 'comment') {
      deleteRssAnnotation(activeAnnotation.id);
      setActiveAnnotationTarget(null);
      setCommentingAnnotationId(null);
      setCommentDraft('');
      Toast.success('评论已删除');
      return;
    }
    updateRssAnnotation(activeAnnotation.id, {
      comment: comment || undefined,
      commentUpdatedAt: comment ? Date.now() : undefined,
    });
    setCommentingAnnotationId(null);
    setCommentDraft('');
    if (comment && !mobileLayout) setActivePanel('comments');
    Toast.success(comment ? '评论已保存' : '评论已移除，高亮已保留');
  };

  const cancelCommentEditing = () => {
    setPendingCommentSelection(null);
    setCommentingAnnotationId(null);
    setCommentDraft('');
  };

  const editAnnotationComment = () => {
    if (!activeAnnotation) return;
    setCommentDraft(activeAnnotation.comment ?? '');
    setCommentingAnnotationId(activeAnnotation.id);
  };

  const deleteActiveAnnotation = () => {
    if (!activeAnnotation) return;
    deleteRssAnnotation(activeAnnotation.id);
    setActiveAnnotationTarget(null);
    setCommentingAnnotationId(null);
    setCommentDraft('');
    Toast.success('已取消高亮');
  };

  const clearAiQuote = useCallback(() => setAiQuote(undefined), []);

  return {
    activeAnnotation,
    activeAnnotationTarget,
    activeHeadingId,
    aiQuote,
    askAboutRssSelection,
    cancelCommentEditing,
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
    selectedAnnotations,
    setActiveAnnotationTarget,
    setCommentDraft,
    setImageViewer,
    setRssSelection,
    syncActiveHeading,
    clearAiQuote,
  };
}
