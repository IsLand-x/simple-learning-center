import { useCallback, type Dispatch, type SetStateAction } from 'react';
import type { View as FoliateView } from 'foliate-js/view.js';

type MutableReaderRef<T> = { current: T };

interface FoliateNavigationOptions {
  viewRef: MutableReaderRef<FoliateView | null>;
  navigationQueueRef: MutableReaderRef<Promise<void>>;
  clearMobileSelectionRef: MutableReaderRef<() => void>;
  touchPagingSelectionLockedRef: MutableReaderRef<boolean>;
  onSelectionRef: MutableReaderRef<(selection: null) => void>;
  setErrorMessage: Dispatch<SetStateAction<string>>;
}

export function useFoliateNavigation({
  viewRef,
  navigationQueueRef,
  clearMobileSelectionRef,
  touchPagingSelectionLockedRef,
  onSelectionRef,
  setErrorMessage,
}: FoliateNavigationOptions) {
  const enqueueNavigation = useCallback(
    (operation: (view: FoliateView) => Promise<void>, errorMessage: string) => {
      const queuedView = viewRef.current;
      if (!queuedView) return;
      const queued = navigationQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          if (viewRef.current === queuedView) await operation(queuedView);
        });
      navigationQueueRef.current = queued.catch(() => setErrorMessage(errorMessage));
    },
    [navigationQueueRef, setErrorMessage, viewRef],
  );

  const turnPage = useCallback(
    (direction: 'next' | 'prev') => {
      clearMobileSelectionRef.current();
      touchPagingSelectionLockedRef.current = false;
      viewRef.current?.renderer.setTouchPagingBlocked?.(false);
      viewRef.current?.deselect();
      onSelectionRef.current(null);
      const message =
        direction === 'next'
          ? '无法翻到下一页，请尝试从目录跳转'
          : '无法翻到上一页，请尝试从目录跳转';
      enqueueNavigation(async (view) => {
        await (direction === 'next' ? view.next() : view.prev());
      }, message);
    },
    [
      clearMobileSelectionRef,
      enqueueNavigation,
      onSelectionRef,
      touchPagingSelectionLockedRef,
      viewRef,
    ],
  );

  return { enqueueNavigation, turnPage };
}
