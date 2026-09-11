import { useEffect } from 'react';
import type { View as FoliateView } from 'foliate-js/view.js';
import {
  applyFoliateReaderLayout,
  applyFoliateReaderStyle,
  getFoliateContents,
} from '../../../lib/foliateReader';
import { ensureReaderFontStylesheet } from '../../../lib/readerFonts';
import { resolveReaderStyle } from '../../../lib/readerThemes';
import type { HighlightItem, ReaderPreferences } from '../../../types';
import type { FoliateReaderStatus } from './useFoliateReaderLifecycle';
import type { MobileSelectionController } from './runtimeTypes';

type MutableReaderRef<T> = { current: T };

interface FoliatePresentationSyncOptions {
  compactLayout: boolean;
  preferences: ReaderPreferences;
  highlights: HighlightItem[];
  status: FoliateReaderStatus;
  viewRef: MutableReaderRef<FoliateView | null>;
  preferencesRef: MutableReaderRef<ReaderPreferences>;
  compactLayoutRef: MutableReaderRef<boolean>;
  appliedAnnotationsRef: MutableReaderRef<Map<string, string>>;
  mobileSelectionControllerRef: MutableReaderRef<MobileSelectionController | null>;
  syncVisibleAnnotations: (view: FoliateView, sectionIndex: number) => Promise<boolean>;
}

export function useFoliatePresentationSync({
  compactLayout,
  preferences,
  highlights,
  status,
  viewRef,
  preferencesRef,
  compactLayoutRef,
  appliedAnnotationsRef,
  mobileSelectionControllerRef,
  syncVisibleAnnotations,
}: FoliatePresentationSyncOptions) {
  useEffect(() => {
    const view = viewRef.current;
    if (!view?.renderer || status === 'loading') return;
    applyFoliateReaderLayout(view, compactLayout);
    applyFoliateReaderStyle(view, preferences, compactLayout);
    window.requestAnimationFrame(() => mobileSelectionControllerRef.current?.refresh());
    const selectedFont = resolveReaderStyle(preferences).fontFamily;
    void Promise.all(
      getFoliateContents(view).map(async ({ doc }) => {
        await ensureReaderFontStylesheet(doc, selectedFont);
        await doc.fonts?.ready;
      }),
    ).then(() => {
      if (viewRef.current !== view) return;
      applyFoliateReaderStyle(view, preferencesRef.current, compactLayoutRef.current);
      window.requestAnimationFrame(() => mobileSelectionControllerRef.current?.refresh());
    });
    appliedAnnotationsRef.current.clear();
    const sectionIndex = getFoliateContents(view)[0]?.index;
    if (sectionIndex !== undefined) void syncVisibleAnnotations(view, sectionIndex);
  }, [
    appliedAnnotationsRef,
    compactLayout,
    compactLayoutRef,
    mobileSelectionControllerRef,
    preferences,
    preferencesRef,
    status,
    syncVisibleAnnotations,
    viewRef,
  ]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view?.renderer || status !== 'ready') return;
    const sectionIndex = getFoliateContents(view)[0]?.index;
    if (sectionIndex !== undefined) void syncVisibleAnnotations(view, sectionIndex);
  }, [highlights, status, syncVisibleAnnotations, viewRef]);
}
