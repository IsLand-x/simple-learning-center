import { useEffect, type Dispatch, type SetStateAction } from 'react';
import type { FoliateRelocateDetail, View as FoliateView } from 'foliate-js/view.js';
import { createFoliateAnnotationEvents } from './annotationEvents';
import { bindFoliateDocumentInteractions } from './bindFoliateDocumentInteractions';
import type {
  FoliateLoadDetail,
  MobileSelectionController,
  MobileSelectionHandleEndpoint,
  MobileSelectionHandlesState,
} from './runtimeTypes';
import { createFoliateSelectionReporter } from './selectionReporter';
import { canNavigateTo, ensureFoliateAnchorIsVisible, flattenFoliateToc } from './tocNavigation';
import { createFoliateTrackpadNavigation } from './trackpadNavigation';
import { loadEpubFile } from '../../../lib/epubStorage';
import {
  configureFoliateReader,
  createFoliateView,
  getFoliateContents,
  prepareFoliateBookForBrowser,
} from '../../../lib/foliateReader';
import type {
  BookItem,
  HighlightItem,
  ReaderHighlightTarget,
  ReaderPreferences,
  ReaderSelection,
} from '../../../types';

type MutableReaderRef<T> = { current: T };

export type FoliateReaderStatus = 'loading' | 'ready' | 'error';

interface ReaderLocationUpdate {
  cfi?: string;
  href?: string;
  progress?: number;
  page?: number;
  totalPages?: number;
}

export interface FoliateReaderLifecycleOptions {
  book: BookItem;
  surfaceRef: MutableReaderRef<HTMLDivElement | null>;
  hostRef: MutableReaderRef<HTMLDivElement | null>;
  viewRef: MutableReaderRef<FoliateView | null>;
  navigationQueueRef: MutableReaderRef<Promise<void>>;
  commentIconTemplateRef: MutableReaderRef<HTMLSpanElement | null>;
  appliedAnnotationsRef: MutableReaderRef<Map<string, string>>;
  highlightsRef: MutableReaderRef<HighlightItem[]>;
  compactLayoutRef: MutableReaderRef<boolean>;
  preferencesRef: MutableReaderRef<ReaderPreferences>;
  onLocationRef: MutableReaderRef<(location: ReaderLocationUpdate) => void>;
  onSelectionRef: MutableReaderRef<(selection: ReaderSelection | null) => void>;
  onHighlightClickRef: MutableReaderRef<(target: ReaderHighlightTarget) => void>;
  onContentInteractionRef: MutableReaderRef<() => void>;
  onCenterTapRef: MutableReaderRef<() => void>;
  touchPagingSelectionLockedRef: MutableReaderRef<boolean>;
  hasCustomMobileSelectionRef: MutableReaderRef<boolean>;
  clearMobileSelectionRef: MutableReaderRef<() => void>;
  mobileSelectionControllerRef: MutableReaderRef<MobileSelectionController | null>;
  mobileSelectionPointerDragRef: MutableReaderRef<{
    pointerId: number;
    endpoint: MobileSelectionHandleEndpoint;
    grabOffsetX: number;
    grabOffsetY: number;
  } | null>;
  setStatus: Dispatch<SetStateAction<FoliateReaderStatus>>;
  setErrorMessage: Dispatch<SetStateAction<string>>;
  setMobileSelectionHandles: Dispatch<SetStateAction<MobileSelectionHandlesState | null>>;
  syncVisibleAnnotations: (view: FoliateView, sectionIndex: number) => Promise<boolean>;
  turnPage: (direction: 'next' | 'prev') => void;
}

export function useFoliateReaderLifecycle({
  book,
  surfaceRef,
  hostRef,
  viewRef,
  navigationQueueRef,
  commentIconTemplateRef,
  appliedAnnotationsRef,
  highlightsRef,
  compactLayoutRef,
  preferencesRef,
  onLocationRef,
  onSelectionRef,
  onHighlightClickRef,
  onContentInteractionRef,
  onCenterTapRef,
  touchPagingSelectionLockedRef,
  hasCustomMobileSelectionRef,
  clearMobileSelectionRef,
  mobileSelectionControllerRef,
  mobileSelectionPointerDragRef,
  setStatus,
  setErrorMessage,
  setMobileSelectionHandles,
  syncVisibleAnnotations,
  turnPage,
}: FoliateReaderLifecycleOptions) {
  // Open and tear down the Foliate view only when the book identity changes.
  // Mutable refs carry current callbacks and presentation without reopening the EPUB.
  useEffect(() => {
    let disposed = false;
    let ownedView: FoliateView | null = null;
    const documentCleanups = new Map<Document, () => void>();
    const clearLifecycleContainers = () => {
      appliedAnnotationsRef.current.clear();
      hostRef.current?.replaceChildren();
    };
    const selectionReporter = createFoliateSelectionReporter({
      isDisposed: () => disposed,
      onSelectionRef,
    });
    const trackpadNavigation = createFoliateTrackpadNavigation({
      viewRef,
      hasCustomMobileSelectionRef,
      touchPagingSelectionLockedRef,
      onContentInteractionRef,
    });
    const { handleWheel } = trackpadNavigation;
    const handleViewPointerDown = () => onContentInteractionRef.current();

    const handleLoad = (event: Event) => {
      const view = viewRef.current;
      if (!view) return;
      const { doc, index } = (event as CustomEvent<FoliateLoadDetail>).detail;
      if (documentCleanups.has(doc)) return;
      let replacedDocument = false;
      for (const [loadedDocument, cleanup] of documentCleanups) {
        if (loadedDocument === doc) continue;
        cleanup();
        documentCleanups.delete(loadedDocument);
        replacedDocument = true;
      }
      if (replacedDocument) {
        selectionReporter.clear();
        touchPagingSelectionLockedRef.current = false;
        view.renderer.setTouchPagingBlocked?.(false);
      }
      bindFoliateDocumentInteractions({
        view,
        doc,
        index,
        isDisposed: () => disposed,
        surfaceRef,
        highlightsRef,
        compactLayoutRef,
        preferencesRef,
        onHighlightClickRef,
        onContentInteractionRef,
        onCenterTapRef,
        touchPagingSelectionLockedRef,
        hasCustomMobileSelectionRef,
        clearMobileSelectionRef,
        mobileSelectionControllerRef,
        mobileSelectionPointerDragRef,
        setMobileSelectionHandles,
        selectionReporter,
        handleWheel,
        turnPage,
        registerCleanup: (cleanup) => documentCleanups.set(doc, cleanup),
      });
    };

    const handleRelocate = (event: Event) => {
      const view = viewRef.current;
      if (!view) return;
      const detail = (event as CustomEvent<FoliateRelocateDetail>).detail;
      const sectionIndex = detail.section?.current ?? getFoliateContents(view)[0]?.index;
      const rawFraction = detail.fraction;
      const progress =
        typeof rawFraction === 'number' && Number.isFinite(rawFraction)
          ? Math.max(0, Math.min(100, rawFraction * 100))
          : undefined;
      onLocationRef.current({
        cfi: detail.cfi,
        href:
          detail.tocItem?.href ??
          (sectionIndex === undefined ? undefined : view.book.sections[sectionIndex]?.id),
        progress,
        page: detail.location ? detail.location.current + 1 : undefined,
        totalPages: detail.location?.total,
      });
      if (sectionIndex !== undefined) void syncVisibleAnnotations(view, sectionIndex);
      window.requestAnimationFrame(() => mobileSelectionControllerRef.current?.refresh());
      if (!disposed) setStatus('ready');
    };

    const { handleCreateOverlay, handleDrawAnnotation, handleShowAnnotation } =
      createFoliateAnnotationEvents({
        isDisposed: () => disposed,
        viewRef,
        appliedAnnotationsRef,
        preferencesRef,
        commentIconTemplateRef,
        highlightsRef,
        onHighlightClickRef,
        syncVisibleAnnotations,
      });

    const setup = async () => {
      touchPagingSelectionLockedRef.current = false;
      setStatus('loading');
      setErrorMessage('请返回书架后重新导入这个 EPUB');
      appliedAnnotationsRef.current.clear();
      const data = await loadEpubFile(book.id);
      const host = hostRef.current;
      if (disposed) return;
      if (!data || !host) throw new Error('EPUB 文件不存在');

      const view = createFoliateView();
      ownedView = view;
      viewRef.current = view;
      view.className = 'foliate-reader';
      view.setAttribute('aria-label', `《${book.title}》阅读区`);
      view.addEventListener('load', handleLoad);
      view.addEventListener('relocate', handleRelocate);
      view.addEventListener('create-overlay', handleCreateOverlay);
      view.addEventListener('draw-annotation', handleDrawAnnotation);
      view.addEventListener('show-annotation', handleShowAnnotation);
      view.addEventListener('pointerdown', handleViewPointerDown);
      view.addEventListener('wheel', handleWheel, { passive: false });
      host.replaceChildren(view);

      const file = new File([data], book.fileName || `${book.title}.epub`, {
        type: 'application/epub+zip',
      });
      await view.open(file);
      if (disposed || ownedView !== view || viewRef.current !== view) return;
      prepareFoliateBookForBrowser(view);
      configureFoliateReader(view, preferencesRef.current, compactLayoutRef.current);

      let displayed = false;
      if (book.currentCfi && canNavigateTo(view, book.currentCfi)) {
        try {
          await view.init({ lastLocation: book.currentCfi });
          displayed = getFoliateContents(view).length > 0;
        } catch {
          // A CFI saved by an older renderer may no longer resolve to a valid DOM range.
        }
      }
      if (!displayed) {
        const chapterHref = flattenFoliateToc(view.book.toc ?? []).find(
          (item) => item.label.trim() === book.currentChapter.trim(),
        )?.href;
        if (chapterHref && canNavigateTo(view, chapterHref)) {
          try {
            const resolved = await view.goTo(chapterHref);
            if (resolved) await ensureFoliateAnchorIsVisible(view, resolved);
            displayed = getFoliateContents(view).length > 0;
          } catch {
            // Fall through to the first readable spine item.
          }
        }
      }
      if (!displayed) {
        const firstSectionIndex = view.book.sections.findIndex(
          (section) => section.linear !== 'no',
        );
        const targetIndex = firstSectionIndex >= 0 ? firstSectionIndex : 0;
        if (canNavigateTo(view, targetIndex)) {
          await view.goTo(targetIndex);
          displayed = getFoliateContents(view).length > 0;
        }
      }
      if (!displayed) throw new Error('EPUB 中没有可渲染的正文');
      if (!disposed) setStatus('ready');
    };

    void setup().catch((error: unknown) => {
      if (disposed) return;
      setErrorMessage(
        error instanceof Error && error.message.includes('不存在')
          ? '本地 EPUB 文件不存在，请返回书架后重新导入'
          : '文件可能已损坏或不符合 EPUB 规范，请尝试重新导入',
      );
      setStatus('error');
    });

    return () => {
      disposed = true;
      selectionReporter.dispose();
      hasCustomMobileSelectionRef.current = false;
      mobileSelectionPointerDragRef.current = null;
      trackpadNavigation.dispose();
      documentCleanups.forEach((cleanup) => cleanup());
      documentCleanups.clear();
      const view = ownedView;
      if (view) {
        touchPagingSelectionLockedRef.current = false;
        view.renderer?.setTouchPagingBlocked?.(false);
        view.removeEventListener('load', handleLoad);
        view.removeEventListener('relocate', handleRelocate);
        view.removeEventListener('create-overlay', handleCreateOverlay);
        view.removeEventListener('draw-annotation', handleDrawAnnotation);
        view.removeEventListener('show-annotation', handleShowAnnotation);
        view.removeEventListener('pointerdown', handleViewPointerDown);
        view.removeEventListener('wheel', handleWheel);
        try {
          view.close();
        } catch {
          // A reader that failed during initialization may already be partially disposed.
        }
        try {
          view.book?.destroy?.();
        } catch {
          // Blob URLs should still be released even if the source EPUB is malformed.
        }
        view.remove();
      }
      ownedView = null;
      if (viewRef.current === view) viewRef.current = null;
      navigationQueueRef.current = Promise.resolve();
      clearLifecycleContainers();
    };
  }, [book.id, syncVisibleAnnotations, turnPage]);
}
