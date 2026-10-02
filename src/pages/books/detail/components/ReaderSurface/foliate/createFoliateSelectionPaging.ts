import type {
  FoliateDocumentInteractionsOptions,
  FoliateGestureState,
} from './documentInteractionTypes';

export function createFoliateSelectionPaging(
  options: Pick<FoliateDocumentInteractionsOptions, 'view' | 'touchPagingSelectionLockedRef'>,
  input: FoliateGestureState,
  hasDocumentSelection: () => boolean,
) {
  const { view, touchPagingSelectionLockedRef } = options;

  let touchPagingUnlockTimer: number | null = null;

  const clearTouchPagingUnlockTimer = () => {
    if (touchPagingUnlockTimer !== null) window.clearTimeout(touchPagingUnlockTimer);
    touchPagingUnlockTimer = null;
  };

  const restoreTouchStartPosition = () => {
    if (view.renderer.cancelTouchPaging) view.renderer.cancelTouchPaging();
    else view.renderer.cancelTouchScroll?.();
    if (input.touchStartContainerPosition !== null) {
      view.renderer.containerPosition = input.touchStartContainerPosition;
    }
  };

  const lockTouchPagingForSelection = () => {
    clearTouchPagingUnlockTimer();
    if (touchPagingSelectionLockedRef.current) return;
    touchPagingSelectionLockedRef.current = true;
    view.renderer.setTouchPagingBlocked?.(true);
    restoreTouchStartPosition();
  };

  const unlockTouchPagingForSelection = () => {
    clearTouchPagingUnlockTimer();
    touchPagingSelectionLockedRef.current = false;
    view.renderer.setTouchPagingBlocked?.(false);
  };

  const scheduleTouchPagingUnlock = () => {
    clearTouchPagingUnlockTimer();
    touchPagingUnlockTimer = window.setTimeout(() => {
      touchPagingUnlockTimer = null;
      if (!input.touchSelectionGesture && !hasDocumentSelection()) {
        unlockTouchPagingForSelection();
      }
    }, 80);
  };
  return {
    clearTouchPagingUnlockTimer,
    restoreTouchStartPosition,
    lockTouchPagingForSelection,
    unlockTouchPagingForSelection,
    scheduleTouchPagingUnlock,
    hasPendingUnlock: () => touchPagingUnlockTimer !== null,
  };
}
