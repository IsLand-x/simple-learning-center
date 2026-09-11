import type { View as FoliateView } from 'foliate-js/view.js';
import { drawFoliateHighlight, rangeToViewportRect } from '../../../lib/foliateReader';
import type { HighlightItem, ReaderHighlightTarget, ReaderPreferences } from '../../../types';
import type { FoliateDrawAnnotationDetail, FoliateShowAnnotationDetail } from './runtimeTypes';

type MutableReaderRef<T> = { current: T };

interface FoliateAnnotationEventsOptions {
  isDisposed: () => boolean;
  viewRef: MutableReaderRef<FoliateView | null>;
  appliedAnnotationsRef: MutableReaderRef<Map<string, string>>;
  preferencesRef: MutableReaderRef<ReaderPreferences>;
  commentIconTemplateRef: MutableReaderRef<HTMLSpanElement | null>;
  highlightsRef: MutableReaderRef<HighlightItem[]>;
  onHighlightClickRef: MutableReaderRef<(target: ReaderHighlightTarget) => void>;
  syncVisibleAnnotations: (view: FoliateView, sectionIndex: number) => Promise<boolean>;
}

export function createFoliateAnnotationEvents({
  isDisposed,
  viewRef,
  appliedAnnotationsRef,
  preferencesRef,
  commentIconTemplateRef,
  highlightsRef,
  onHighlightClickRef,
  syncVisibleAnnotations,
}: FoliateAnnotationEventsOptions) {
  const handleCreateOverlay = (event: Event) => {
    const view = viewRef.current;
    if (!view) return;
    const { index } = (event as CustomEvent<{ index: number }>).detail;
    appliedAnnotationsRef.current.clear();
    // Foliate emits create-overlay synchronously before attaching the new
    // overlayer to the renderer. Retry in a microtask, then let relocate
    // provide the final post-navigation synchronization fallback.
    queueMicrotask(() => {
      if (!isDisposed() && viewRef.current === view) void syncVisibleAnnotations(view, index);
    });
  };

  const handleDrawAnnotation = (event: Event) => {
    const { annotation, draw } = (event as CustomEvent<FoliateDrawAnnotationDetail>).detail;
    draw((rects) =>
      drawFoliateHighlight({
        rects,
        annotation,
        preferences: preferencesRef.current,
        iconTemplate: commentIconTemplateRef.current,
      }),
    );
  };

  const handleShowAnnotation = (event: Event) => {
    const { value, range } = (event as CustomEvent<FoliateShowAnnotationDetail>).detail;
    const highlight = highlightsRef.current.find((item) => item.cfi === value);
    if (!highlight) return;
    onHighlightClickRef.current({
      highlightId: highlight.id,
      rect: rangeToViewportRect(range),
    });
  };

  return { handleCreateOverlay, handleDrawAnnotation, handleShowAnnotation };
}
