import {
  createMobileTouchGesture,
  markMobileTouchSelection,
  MOBILE_TEXT_SELECTION_HOLD_MS,
  resolveMobileTouchMove,
  shouldPreserveMobileTextSelection,
} from '../gestures';
import { MOBILE_CUSTOM_SELECTION_SLOP_PX } from './constants';
import type { createFoliateMobileSelection } from './createFoliateMobileSelection';
import type { createFoliateSelectionPaging } from './createFoliateSelectionPaging';
import type {
  FoliateDocumentInteractionsOptions,
  FoliateGestureState,
} from './documentInteractionTypes';
import { hasActiveTextSelection } from './interactionHelpers';

export function createFoliateGestureInput(
  options: Pick<
    FoliateDocumentInteractionsOptions,
    | 'view'
    | 'doc'
    | 'index'
    | 'compactLayoutRef'
    | 'touchPagingSelectionLockedRef'
    | 'selectionReporter'
  >,
  input: FoliateGestureState,
  mobileSelection: ReturnType<typeof createFoliateMobileSelection>,
  paging: ReturnType<typeof createFoliateSelectionPaging>,
) {
  const { view, doc, index, compactLayoutRef, touchPagingSelectionLockedRef, selectionReporter } =
    options;

  let touchSelectionTimer: number | null = null;

  let customSelectionHoldCanceled = false;

  const clearTouchSelectionTimer = () => {
    if (touchSelectionTimer !== null) window.clearTimeout(touchSelectionTimer);
    touchSelectionTimer = null;
  };

  const handleTouchStartCapture = (touchEvent: TouchEvent) => {
    clearTouchSelectionTimer();
    customSelectionHoldCanceled = false;
    const touch = touchEvent.touches.length === 1 ? touchEvent.touches[0] : null;
    if (mobileSelection.hasCustomSelection()) {
      mobileSelection.clearThisDocumentMobileSelection();
      input.suppressCenterTapUntil = performance.now() + 450;
    }
    const selectionActive = mobileSelection.hasDocumentSelection();
    input.pendingPress =
      mobileSelection.customMobileSelectionEnabled && touch && !selectionActive
        ? (() => {
            const boundary = mobileSelection.getBoundaryAtDocumentPoint(
              touch.clientX,
              touch.clientY,
            );
            return boundary
              ? {
                  boundary,
                  clientX: touch.clientX,
                  clientY: touch.clientY,
                  touchIdentifier: touch.identifier,
                }
              : null;
          })()
        : null;
    if (selectionActive) {
      paging.clearTouchPagingUnlockTimer();
      paging.lockTouchPagingForSelection();
    } else if (paging.hasPendingUnlock()) {
      // A collapsed selection used to leave mobile paging locked until the
      // debounce expired. A new gesture is definitive user intent, so make
      // that gesture eligible for paging immediately.
      paging.unlockTouchPagingForSelection();
    }
    const selectionPagingLocked = touchPagingSelectionLockedRef.current;
    input.touchStartContainerPosition = touch ? view.renderer.containerPosition : null;
    input.touchSelectionGesture = touch
      ? createMobileTouchGesture({
          startedAt: performance.now(),
          startX: touch.clientX,
          startY: touch.clientY,
          hasSelection: selectionActive || selectionPagingLocked,
        })
      : null;
    if (input.touchSelectionGesture?.intent === 'selection') {
      touchEvent.stopImmediatePropagation();
      return;
    }
    if (input.touchSelectionGesture) {
      const pendingGesture = input.touchSelectionGesture;
      touchSelectionTimer = window.setTimeout(() => {
        const customHoldReady =
          mobileSelection.customMobileSelectionEnabled && !customSelectionHoldCanceled;
        if (
          input.touchSelectionGesture === pendingGesture &&
          (pendingGesture.intent === 'pending' || customHoldReady)
        ) {
          if (
            !mobileSelection.customMobileSelectionEnabled ||
            (customHoldReady && mobileSelection.beginCustomMobileSelection())
          ) {
            markMobileTouchSelection(pendingGesture);
            // Foliate enters its paging state on touchstart. Restore the
            // exact page as soon as the long press becomes our selection.
            paging.lockTouchPagingForSelection();
            input.suppressCenterTapUntil = performance.now() + 450;
          } else {
            input.touchSelectionGesture = null;
            input.pendingPress = null;
            paging.scheduleTouchPagingUnlock();
          }
        }
        touchSelectionTimer = null;
      }, MOBILE_TEXT_SELECTION_HOLD_MS);
    }
  };

  const handleSelectStartCapture = (selectionEvent: Event) => {
    if (mobileSelection.customMobileSelectionEnabled) {
      if (selectionEvent.cancelable) selectionEvent.preventDefault();
      if (!mobileSelection.hasCustomSelection()) mobileSelection.beginCustomMobileSelection();
      mobileSelection.scrubNativeSelection();
      markMobileTouchSelection(input.touchSelectionGesture);
      clearTouchSelectionTimer();
      input.suppressCenterTapUntil = performance.now() + 450;
      selectionEvent.stopImmediatePropagation();
      return;
    }
    if (compactLayoutRef.current || input.touchSelectionGesture) {
      paging.lockTouchPagingForSelection();
      selectionEvent.stopImmediatePropagation();
    }
    markMobileTouchSelection(input.touchSelectionGesture);
    clearTouchSelectionTimer();
  };

  const handleTouchMoveCapture = (touchEvent: TouchEvent) => {
    const gesture = input.touchSelectionGesture;
    const touch = input.pendingPress
      ? Array.from(touchEvent.touches).find(
          (candidate) => candidate.identifier === input.pendingPress?.touchIdentifier,
        )
      : touchEvent.touches[0];
    if (!gesture || !touch) return;
    if (mobileSelection.hasCustomSelection()) {
      clearTouchSelectionTimer();
      markMobileTouchSelection(gesture);
      paging.lockTouchPagingForSelection();
      mobileSelection.updateCustomMobileSelectionFromTouch(touch, false);
      input.suppressCenterTapUntil = performance.now() + 450;
      if (touchEvent.cancelable) touchEvent.preventDefault();
      touchEvent.stopImmediatePropagation();
      return;
    }
    const elapsed = performance.now() - gesture.startedAt;
    const distance = Math.hypot(touch.clientX - gesture.startX, touch.clientY - gesture.startY);
    if (
      mobileSelection.customMobileSelectionEnabled &&
      gesture.intent === 'pending' &&
      elapsed < MOBILE_TEXT_SELECTION_HOLD_MS &&
      distance >= MOBILE_CUSTOM_SELECTION_SLOP_PX
    ) {
      customSelectionHoldCanceled = true;
      clearTouchSelectionTimer();
      input.pendingPress = null;
      input.touchSelectionGesture = null;
      return;
    }
    const previousIntent = gesture.intent;
    const intent = resolveMobileTouchMove({
      gesture,
      currentX: touch.clientX,
      currentY: touch.clientY,
      currentTime: performance.now(),
      hasSelection: mobileSelection.hasDocumentSelection() || touchPagingSelectionLockedRef.current,
    });
    if (intent === 'selection' && previousIntent !== 'selection') {
      paging.lockTouchPagingForSelection();
    }
    if (
      mobileSelection.customMobileSelectionEnabled &&
      intent === 'selection' &&
      elapsed >= MOBILE_TEXT_SELECTION_HOLD_MS &&
      mobileSelection.beginCustomMobileSelection()
    ) {
      mobileSelection.updateCustomMobileSelectionFromTouch(touch, false);
      clearTouchSelectionTimer();
      if (touchEvent.cancelable) touchEvent.preventDefault();
      touchEvent.stopImmediatePropagation();
      return;
    }
    if (
      Math.abs(touch.clientX - gesture.startX) >= 8 ||
      Math.abs(touch.clientY - gesture.startY) >= 8
    )
      input.suppressCenterTapUntil = performance.now() + 450;
    if (intent !== 'pending') input.suppressCenterTapUntil = performance.now() + 450;
    if (intent !== 'pending' && !mobileSelection.customMobileSelectionEnabled)
      clearTouchSelectionTimer();
    if (intent !== 'page-turn') {
      if (mobileSelection.customMobileSelectionEnabled && touchEvent.cancelable)
        touchEvent.preventDefault();
      touchEvent.stopImmediatePropagation();
    }
  };

  const handleTouchEndCapture = (touchEvent: TouchEvent) => {
    const gesture = input.touchSelectionGesture;
    const endedTouch = input.pendingPress
      ? Array.from(touchEvent.changedTouches).find(
          (candidate) => candidate.identifier === input.pendingPress?.touchIdentifier,
        )
      : touchEvent.changedTouches[0];
    if (
      mobileSelection.customMobileSelectionEnabled &&
      !mobileSelection.hasCustomSelection() &&
      gesture &&
      !customSelectionHoldCanceled &&
      performance.now() - gesture.startedAt >= MOBILE_TEXT_SELECTION_HOLD_MS
    )
      mobileSelection.beginCustomMobileSelection();
    if (mobileSelection.hasCustomSelection()) {
      if (endedTouch) mobileSelection.updateCustomMobileSelectionFromTouch(endedTouch, true);
      mobileSelection.finishCustomMobileTouchSelection();
      input.touchSelectionGesture = null;
      input.touchStartContainerPosition = null;
      input.pendingPress = null;
      clearTouchSelectionTimer();
      paging.lockTouchPagingForSelection();
      input.suppressCenterTapUntil = performance.now() + 450;
      if (touchEvent.cancelable) touchEvent.preventDefault();
      touchEvent.stopImmediatePropagation();
      return;
    }
    const shouldKeepSelection = shouldPreserveMobileTextSelection({
      gesture,
      currentTime: performance.now(),
      hasSelection: mobileSelection.hasDocumentSelection() || touchPagingSelectionLockedRef.current,
    });
    if (gesture?.intent !== 'pending' || shouldKeepSelection) {
      input.suppressCenterTapUntil = performance.now() + 450;
    }
    if (shouldKeepSelection) {
      paging.lockTouchPagingForSelection();
    }
    input.touchSelectionGesture = null;
    input.touchStartContainerPosition = null;
    input.pendingPress = null;
    clearTouchSelectionTimer();
    if (!mobileSelection.hasDocumentSelection()) paging.scheduleTouchPagingUnlock();
    if (shouldKeepSelection) touchEvent.stopImmediatePropagation();
  };

  const handleTouchCancelCapture = (touchEvent: TouchEvent) => {
    const gesture = input.touchSelectionGesture;
    if (mobileSelection.hasCustomSelection()) {
      mobileSelection.finishCustomMobileTouchSelection();
      input.touchSelectionGesture = null;
      input.touchStartContainerPosition = null;
      input.pendingPress = null;
      clearTouchSelectionTimer();
      paging.lockTouchPagingForSelection();
      input.suppressCenterTapUntil = performance.now() + 450;
      if (touchEvent.cancelable) touchEvent.preventDefault();
      touchEvent.stopImmediatePropagation();
      return;
    }
    const selectionActive =
      touchPagingSelectionLockedRef.current || mobileSelection.hasDocumentSelection();
    // Mobile WebKit can emit touchcancel before exposing the native text
    // selection. Since the browser cancelled the gesture, pagination must
    // never settle on an adjacent page, even if early movement briefly
    // looked like a horizontal page turn.
    const shouldCancelPaging = Boolean(gesture) || selectionActive;
    if (shouldCancelPaging) {
      input.suppressCenterTapUntil = performance.now() + 450;
      if (selectionActive || gesture?.intent !== 'page-turn') {
        paging.lockTouchPagingForSelection();
      } else {
        paging.restoreTouchStartPosition();
      }
    }
    input.touchSelectionGesture = null;
    input.touchStartContainerPosition = null;
    input.pendingPress = null;
    clearTouchSelectionTimer();
    if (!mobileSelection.hasDocumentSelection()) paging.scheduleTouchPagingUnlock();
    if (shouldCancelPaging) touchEvent.stopImmediatePropagation();
  };

  const handleContextMenu = (contextMenuEvent: Event) => {
    contextMenuEvent.preventDefault();
    if (mobileSelection.customMobileSelectionEnabled) {
      mobileSelection.beginCustomMobileSelection();
      mobileSelection.scrubNativeSelection();
      markMobileTouchSelection(input.touchSelectionGesture);
      clearTouchSelectionTimer();
      input.suppressCenterTapUntil = performance.now() + 450;
      contextMenuEvent.stopImmediatePropagation();
      return;
    }
    if (!compactLayoutRef.current) return;
    // Android Chrome may announce a native long press through contextmenu
    // before its Selection is observable. Treat it as selection intent so
    // a synthetic mouse pointer cannot settle or auto-turn the page.
    paging.lockTouchPagingForSelection();
    markMobileTouchSelection(input.touchSelectionGesture);
    clearTouchSelectionTimer();
    input.suppressCenterTapUntil = performance.now() + 450;
    contextMenuEvent.stopImmediatePropagation();
  };

  const handleSelectionChange = () => {
    const selection = doc.defaultView?.getSelection();
    if (mobileSelection.hasCustomSelection()) {
      if (selection?.rangeCount) mobileSelection.removeNativeSelection();
      mobileSelection.reportMobileSelection();
      return;
    }
    if (mobileSelection.customMobileSelectionEnabled) {
      if (selection?.rangeCount) {
        mobileSelection.beginCustomMobileSelection();
        mobileSelection.removeNativeSelection();
      }
      if (mobileSelection.hasCustomSelection()) mobileSelection.reportMobileSelection();
      return;
    }
    if (mobileSelection.isProgrammatic()) return;
    const selectionActive = hasActiveTextSelection(selection);
    const mobileSelectionActive =
      compactLayoutRef.current ||
      touchPagingSelectionLockedRef.current ||
      input.touchSelectionGesture !== null;
    if (selectionActive) {
      if (mobileSelectionActive) {
        paging.lockTouchPagingForSelection();
      }
      markMobileTouchSelection(input.touchSelectionGesture);
      clearTouchSelectionTimer();
    } else if (!input.touchSelectionGesture) {
      paging.scheduleTouchPagingUnlock();
    }
    selectionReporter.report(view, doc, index);
  };
  return {
    clearTouchSelectionTimer,
    handleTouchStartCapture,
    handleSelectStartCapture,
    handleTouchMoveCapture,
    handleTouchEndCapture,
    handleTouchCancelCapture,
    handleContextMenu,
    handleSelectionChange,
  };
}
