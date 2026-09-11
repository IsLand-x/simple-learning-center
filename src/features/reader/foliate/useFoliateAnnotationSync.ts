import { useCallback } from 'react';
import type { View as FoliateView } from 'foliate-js/view.js';
import { createFoliateAnnotation, getFoliateContents } from '../../../lib/foliateReader';
import type { HighlightItem, ReaderPreferences } from '../../../types';
import { annotationSignature } from './interactionHelpers';

type MutableReaderRef<T> = { current: T };

interface FoliateAnnotationSyncOptions {
  appliedAnnotationsRef: MutableReaderRef<Map<string, string>>;
  highlightsRef: MutableReaderRef<HighlightItem[]>;
  preferencesRef: MutableReaderRef<ReaderPreferences>;
}

export function useFoliateAnnotationSync({
  appliedAnnotationsRef,
  highlightsRef,
  preferencesRef,
}: FoliateAnnotationSyncOptions) {
  return useCallback(
    async (view: FoliateView, sectionIndex: number) => {
      const visibleOverlayer = getFoliateContents(view).find(
        (content) => content.index === sectionIndex,
      )?.overlayer;
      if (!visibleOverlayer) return false;

      const desired = new Map<string, { highlight: HighlightItem; signature: string }>();
      highlightsRef.current.forEach((highlight) => {
        const target = view.resolveNavigation(highlight.cfi);
        if (target?.index !== sectionIndex) return;
        desired.set(highlight.cfi, {
          highlight,
          signature: annotationSignature(highlight, preferencesRef.current),
        });
      });

      for (const [cfi, signature] of appliedAnnotationsRef.current) {
        if (desired.get(cfi)?.signature === signature) continue;
        await view.deleteAnnotation({ value: cfi }).catch(() => undefined);
        if (
          getFoliateContents(view).find((content) => content.index === sectionIndex)?.overlayer !==
          visibleOverlayer
        )
          return false;
        appliedAnnotationsRef.current.delete(cfi);
      }

      for (const [cfi, { highlight, signature }] of desired) {
        if (appliedAnnotationsRef.current.get(cfi) === signature) continue;
        try {
          await view.addAnnotation(createFoliateAnnotation(highlight));
          if (
            getFoliateContents(view).find((content) => content.index === sectionIndex)
              ?.overlayer !== visibleOverlayer
          )
            return false;
          appliedAnnotationsRef.current.set(cfi, signature);
        } catch {
          appliedAnnotationsRef.current.delete(cfi);
        }
      }
      return true;
    },
    [appliedAnnotationsRef, highlightsRef, preferencesRef],
  );
}
