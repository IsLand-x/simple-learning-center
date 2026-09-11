import { useImperativeHandle, type Dispatch, type Ref, type SetStateAction } from 'react';
import type { View as FoliateView } from 'foliate-js/view.js';
import { getFoliateContents } from '../../../lib/foliateReader';
import { navigateToFoliateTarget, resolveFoliateTarget } from './tocNavigation';
import { useFoliateNavigation } from './useFoliateNavigation';

type MutableReaderRef<T> = { current: T };

interface FoliateReaderControllerHandle {
  next: () => void;
  prev: () => void;
  display: (target: string, label?: string) => void;
  clearSelection: () => void;
  getCurrentText: () => string;
}

interface FoliateReaderControllerOptions {
  controllerRef: Ref<FoliateReaderControllerHandle>;
  viewRef: MutableReaderRef<FoliateView | null>;
  navigationQueueRef: MutableReaderRef<Promise<void>>;
  clearMobileSelectionRef: MutableReaderRef<() => void>;
  touchPagingSelectionLockedRef: MutableReaderRef<boolean>;
  onSelectionRef: MutableReaderRef<(selection: null) => void>;
  setErrorMessage: Dispatch<SetStateAction<string>>;
}

export function useFoliateReaderController({
  controllerRef,
  viewRef,
  navigationQueueRef,
  clearMobileSelectionRef,
  touchPagingSelectionLockedRef,
  onSelectionRef,
  setErrorMessage,
}: FoliateReaderControllerOptions) {
  const { enqueueNavigation, turnPage } = useFoliateNavigation({
    viewRef,
    navigationQueueRef,
    clearMobileSelectionRef,
    touchPagingSelectionLockedRef,
    onSelectionRef,
    setErrorMessage,
  });

  useImperativeHandle(
    controllerRef,
    () => ({
      next: () => turnPage('next'),
      prev: () => turnPage('prev'),
      display: (target, label) => {
        clearMobileSelectionRef.current();
        touchPagingSelectionLockedRef.current = false;
        viewRef.current?.renderer.setTouchPagingBlocked?.(false);
        viewRef.current?.deselect();
        onSelectionRef.current(null);
        enqueueNavigation(async (view) => {
          const foliateTarget = resolveFoliateTarget(view, target, label);
          if (!foliateTarget || !(await navigateToFoliateTarget(view, foliateTarget))) {
            throw new Error('无法定位到所选内容');
          }
        }, '无法定位到所选内容');
      },
      clearSelection: () => {
        clearMobileSelectionRef.current();
        touchPagingSelectionLockedRef.current = false;
        viewRef.current?.renderer.setTouchPagingBlocked?.(false);
        viewRef.current?.deselect();
      },
      getCurrentText: () =>
        getFoliateContents(viewRef.current)
          .map((content) => content.doc.body?.innerText ?? '')
          .filter(Boolean)
          .join('\n\n'),
    }),
    [
      clearMobileSelectionRef,
      enqueueNavigation,
      onSelectionRef,
      touchPagingSelectionLockedRef,
      turnPage,
      viewRef,
    ],
  );

  return turnPage;
}
