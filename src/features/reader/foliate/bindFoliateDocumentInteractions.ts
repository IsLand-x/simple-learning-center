import type { Dispatch, SetStateAction } from 'react';
import type { View as FoliateView } from 'foliate-js/view.js';
import {
  MOBILE_CUSTOM_HIGHLIGHT_NAME,
  MOBILE_CUSTOM_SELECTION_CLASS,
  MOBILE_CUSTOM_SELECTION_SLOP_PX,
  MOBILE_SELECTION_PAGE_EDGE_HOLD_MS,
} from './constants';
import {
  findFoliateHighlightAtPoint,
  hasActiveTextSelection,
  isBlockedInteractionTarget,
  isEditingTarget,
} from './interactionHelpers';
import {
  cloneSelectionBoundary,
  compareSelectionBoundaries,
  constrainRangeToVisibleRange,
  createRangeBetweenBoundaries,
  createWordRangeAtPoint,
  getCaretBoundaryAtPoint,
  getInclusiveVisiblePageBoundary,
  getMobileSelectionBoundaryViewportRect,
  getMobileSelectionHandlePositions,
  getMobileSelectionPageEdgeDirection,
  shouldUseCustomMobileSelection,
} from './mobileSelectionGeometry';
import type {
  MobileSelectionController,
  MobileSelectionHandleEndpoint,
  MobileSelectionHandlesState,
  MobileSelectionPageDirection,
  MobileSelectionPointerDrag,
  MobileSelectionSession,
  SelectionBoundary,
} from './runtimeTypes';
import type { FoliateSelectionReporter } from './selectionReporter';
import {
  applyFoliateReaderStyle,
  drawFoliateActiveSelection,
  getFoliateContents,
  rangeToViewportRect,
} from '../../../lib/foliateReader';
import { ensureReaderFontStylesheet } from '../../../lib/readerFonts';
import {
  createMobileTouchGesture,
  markMobileTouchSelection,
  MOBILE_TEXT_SELECTION_HOLD_MS,
  resolveMobileTouchMove,
  shouldPreserveMobileTextSelection,
  type MobileTouchGesture,
} from '../../../lib/readerGestures';
import { resolveReaderStyle } from '../../../lib/readerThemes';
import type { HighlightItem, ReaderHighlightTarget, ReaderPreferences } from '../../../types';

type MutableReaderRef<T> = { current: T };

interface FoliateDocumentInteractionsOptions {
  view: FoliateView;
  doc: Document;
  index: number;
  isDisposed: () => boolean;
  surfaceRef: MutableReaderRef<HTMLDivElement | null>;
  highlightsRef: MutableReaderRef<HighlightItem[]>;
  compactLayoutRef: MutableReaderRef<boolean>;
  preferencesRef: MutableReaderRef<ReaderPreferences>;
  onHighlightClickRef: MutableReaderRef<(target: ReaderHighlightTarget) => void>;
  onContentInteractionRef: MutableReaderRef<() => void>;
  onCenterTapRef: MutableReaderRef<() => void>;
  touchPagingSelectionLockedRef: MutableReaderRef<boolean>;
  hasCustomMobileSelectionRef: MutableReaderRef<boolean>;
  clearMobileSelectionRef: MutableReaderRef<() => void>;
  mobileSelectionControllerRef: MutableReaderRef<MobileSelectionController | null>;
  mobileSelectionPointerDragRef: MutableReaderRef<MobileSelectionPointerDrag | null>;
  setMobileSelectionHandles: Dispatch<SetStateAction<MobileSelectionHandlesState | null>>;
  selectionReporter: FoliateSelectionReporter;
  handleWheel: (event: WheelEvent) => void;
  turnPage: (direction: 'next' | 'prev') => void;
  registerCleanup: (cleanup: () => void) => void;
}

export function bindFoliateDocumentInteractions({
  view,
  doc,
  index,
  isDisposed,
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
  registerCleanup,
}: FoliateDocumentInteractionsOptions) {
  // Foliate dispatches `load` before it creates and attaches the document
  // overlayer. Only decide whether this document needs custom selection
  // here; resolve the overlayer lazily when the long press actually fires.
  const customMobileSelectionEnabled = shouldUseCustomMobileSelection(doc);
  if (customMobileSelectionEnabled) {
    doc.documentElement.classList.add(MOBILE_CUSTOM_SELECTION_CLASS);
  }

  let touchSelectionGesture: MobileTouchGesture | null = null;
  let touchSelectionTimer: number | null = null;
  let customSelectionHoldCanceled = false;
  let touchPagingUnlockTimer: number | null = null;
  let touchStartContainerPosition: number | null = null;
  let pendingPress: {
    boundary: SelectionBoundary;
    clientX: number;
    clientY: number;
    touchIdentifier: number;
  } | null = null;
  let mobileSelectionSession: MobileSelectionSession | null = null;
  let mobileSelectionProgrammatic = false;
  let mobileSelectionProgrammaticTimer: number | null = null;
  let mobileSelectionScrubFrame = 0;
  let mobileSelectionDragFrame = 0;
  let mobileSelectionDragEndpoint: MobileSelectionHandleEndpoint | null = null;
  let mobileSelectionDragFixedBoundary: SelectionBoundary | null = null;
  let mobileSelectionTouchPivot: Range | null = null;
  let mobileSelectionDragPoint: {
    endpoint: MobileSelectionHandleEndpoint;
    clientX: number;
    clientY: number;
  } | null = null;
  let mobileSelectionPageTurnTimer: number | null = null;
  let mobileSelectionPageTurnDirection: MobileSelectionPageDirection | null = null;
  let mobileSelectionPageTurnInFlight = false;
  let mobileSelectionPageTurnNeedsRearm = false;
  let mobileSelectionEdgeContinuationDirection: MobileSelectionPageDirection | null = null;
  let mobileSelectionLatestEdgeDrag: {
    endpoint: MobileSelectionHandleEndpoint;
    direction: MobileSelectionPageDirection;
  } | null = null;
  let suppressCenterTapUntil = 0;
  const hasDocumentSelection = () =>
    Boolean(mobileSelectionSession) || hasActiveTextSelection(doc.defaultView?.getSelection());
  const clearTouchSelectionTimer = () => {
    if (touchSelectionTimer !== null) window.clearTimeout(touchSelectionTimer);
    touchSelectionTimer = null;
  };
  const clearTouchPagingUnlockTimer = () => {
    if (touchPagingUnlockTimer !== null) window.clearTimeout(touchPagingUnlockTimer);
    touchPagingUnlockTimer = null;
  };
  const clearMobileSelectionProgrammaticTimer = () => {
    if (mobileSelectionProgrammaticTimer !== null) {
      window.clearTimeout(mobileSelectionProgrammaticTimer);
    }
    mobileSelectionProgrammaticTimer = null;
  };
  const clearMobileSelectionScrubFrame = () => {
    window.cancelAnimationFrame(mobileSelectionScrubFrame);
    mobileSelectionScrubFrame = 0;
  };
  const guardMobileSelectionChange = () => {
    clearMobileSelectionProgrammaticTimer();
    mobileSelectionProgrammatic = true;
    mobileSelectionProgrammaticTimer = window.setTimeout(() => {
      mobileSelectionProgrammatic = false;
      mobileSelectionProgrammaticTimer = null;
    }, 150);
  };
  const removeNativeSelection = () => {
    const selection = doc.defaultView?.getSelection();
    if (!selection?.rangeCount) return;
    guardMobileSelectionChange();
    selection.removeAllRanges();
  };
  const scrubNativeSelection = (remainingFrames = 2) => {
    clearMobileSelectionScrubFrame();
    removeNativeSelection();
    if (!mobileSelectionSession || remainingFrames <= 0) return;
    mobileSelectionScrubFrame = window.requestAnimationFrame(() => {
      mobileSelectionScrubFrame = 0;
      if (mobileSelectionSession) scrubNativeSelection(remainingFrames - 1);
    });
  };
  const restoreTouchStartPosition = () => {
    if (view.renderer.cancelTouchPaging) view.renderer.cancelTouchPaging();
    else view.renderer.cancelTouchScroll?.();
    if (touchStartContainerPosition !== null) {
      view.renderer.containerPosition = touchStartContainerPosition;
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
      if (!touchSelectionGesture && !hasDocumentSelection()) {
        unlockTouchPagingForSelection();
      }
    }, 80);
  };
  const clearMobileSelectionPageTurnTimer = () => {
    if (mobileSelectionPageTurnTimer !== null) {
      window.clearTimeout(mobileSelectionPageTurnTimer);
    }
    mobileSelectionPageTurnTimer = null;
    mobileSelectionPageTurnDirection = null;
  };
  const resetMobileSelectionPageTurnState = () => {
    clearMobileSelectionPageTurnTimer();
    mobileSelectionPageTurnNeedsRearm = false;
    mobileSelectionEdgeContinuationDirection = null;
    mobileSelectionLatestEdgeDrag = null;
  };
  const getVisibleRange = () => {
    const visibleRange = view.lastLocation?.range;
    if (!visibleRange) return null;
    const visibleDocument =
      visibleRange.startContainer.nodeType === Node.DOCUMENT_NODE
        ? (visibleRange.startContainer as Document)
        : visibleRange.startContainer.ownerDocument;
    return visibleDocument === doc ? visibleRange : null;
  };
  const clampBoundaryToVisibleRange = (boundary: SelectionBoundary) => {
    const visibleRange = getVisibleRange();
    if (!visibleRange) return boundary;
    const visibleStart = cloneSelectionBoundary(
      visibleRange.startContainer,
      visibleRange.startOffset,
    );
    const visibleEnd = cloneSelectionBoundary(visibleRange.endContainer, visibleRange.endOffset);
    if (compareSelectionBoundaries(doc, boundary, visibleStart) < 0) return visibleStart;
    if (compareSelectionBoundaries(doc, boundary, visibleEnd) > 0) return visibleEnd;
    return boundary;
  };
  const getBoundaryAtDocumentPoint = (clientX: number, clientY: number) => {
    const boundary = getCaretBoundaryAtPoint(doc, clientX, clientY);
    if (!boundary || boundary.node.ownerDocument !== doc) return null;
    return clampBoundaryToVisibleRange(boundary);
  };
  const getBoundaryAtOuterPoint = (clientX: number, clientY: number) => {
    const frameRect = doc.defaultView?.frameElement?.getBoundingClientRect();
    const surfaceRect = surfaceRef.current?.getBoundingClientRect();
    if (!frameRect || !surfaceRect) return null;
    const left = Math.max(frameRect.left, surfaceRect.left) + 2;
    const right = Math.min(frameRect.right, surfaceRect.right) - 2;
    const top = Math.max(frameRect.top, surfaceRect.top) + 2;
    const bottom = Math.min(frameRect.bottom, surfaceRect.bottom) - 2;
    if (right <= left || bottom <= top) return null;
    const x = Math.max(left, Math.min(right, clientX));
    const y = Math.max(top, Math.min(bottom, clientY));
    return getBoundaryAtDocumentPoint(x - frameRect.left, y - frameRect.top);
  };
  const getDocumentPageEdgeDirection = (clientY: number) => {
    const height = doc.defaultView?.innerHeight ?? doc.documentElement.clientHeight;
    return getMobileSelectionPageEdgeDirection(clientY, 0, height);
  };
  const getOuterPageEdgeDirection = (clientY: number) => {
    const frameRect = doc.defaultView?.frameElement?.getBoundingClientRect();
    const surfaceRect = surfaceRef.current?.getBoundingClientRect();
    if (!frameRect || !surfaceRect) return null;
    return getMobileSelectionPageEdgeDirection(
      clientY,
      Math.max(frameRect.top, surfaceRect.top),
      Math.min(frameRect.bottom, surfaceRect.bottom),
    );
  };
  const paintMobileSelection = () => {
    const session = mobileSelectionSession;
    if (!session) return false;
    try {
      session.overlayer.add(MOBILE_CUSTOM_HIGHLIGHT_NAME, session.range, (rects) =>
        drawFoliateActiveSelection({
          rects,
          preferences: preferencesRef.current,
        }),
      );
      return true;
    } catch {
      return false;
    }
  };
  const alignMobileSelectionHandlesToActiveDrag = (
    positions: MobileSelectionHandlesState,
    session: MobileSelectionSession,
  ) => {
    const dragEndpoint = mobileSelectionDragEndpoint;
    if (!dragEndpoint) {
      positions.dragging = null;
      return positions;
    }
    if (session.activeBoundary !== dragEndpoint) {
      positions[dragEndpoint] = positions[session.activeBoundary];
      positions[session.activeBoundary] = null;
    }
    positions.dragging = dragEndpoint;
    return positions;
  };
  const syncMobileSelectionHandles = () => {
    const session = mobileSelectionSession;
    const surface = surfaceRef.current;
    const positions =
      session && surface ? getMobileSelectionHandlePositions(session.range, surface) : null;
    setMobileSelectionHandles(
      positions && session ? alignMobileSelectionHandlesToActiveDrag(positions, session) : null,
    );
  };
  const refreshMobileSelection = () => {
    if (mobileSelectionPageTurnInFlight) return;
    paintMobileSelection();
    syncMobileSelectionHandles();
  };
  const clearMobileSelectionDragFrame = () => {
    window.cancelAnimationFrame(mobileSelectionDragFrame);
    mobileSelectionDragFrame = 0;
    mobileSelectionDragPoint = null;
  };
  const clearMobileSelection = (notify = true) => {
    clearMobileSelectionDragFrame();
    resetMobileSelectionPageTurnState();
    clearMobileSelectionScrubFrame();
    mobileSelectionDragEndpoint = null;
    mobileSelectionDragFixedBoundary = null;
    mobileSelectionTouchPivot = null;
    pendingPress = null;
    mobileSelectionPointerDragRef.current = null;
    const session = mobileSelectionSession;
    mobileSelectionSession = null;
    hasCustomMobileSelectionRef.current = false;
    if (session) session.overlayer.remove(MOBILE_CUSTOM_HIGHLIGHT_NAME);
    setMobileSelectionHandles(null);
    removeNativeSelection();
    selectionReporter.clear(notify);
  };
  const reportMobileSelection = () => {
    const session = mobileSelectionSession;
    if (!session) return;
    selectionReporter.reportRange(
      view,
      session.index,
      session.range,
      getMobileSelectionBoundaryViewportRect(session.range, session.activeBoundary),
    );
  };
  const applyMobileSelectionBoundary = (
    endpoint: MobileSelectionHandleEndpoint,
    movingBoundary: SelectionBoundary,
    commit: boolean,
    visualPoint?: { clientX: number; clientY: number },
  ) => {
    const session = mobileSelectionSession;
    const fixedBoundary = mobileSelectionDragFixedBoundary;
    if (!session || !fixedBoundary) return;
    try {
      const nextRange = createRangeBetweenBoundaries(doc, fixedBoundary, movingBoundary);
      if (nextRange.collapsed || !nextRange.toString().trim()) return;
      session.range = nextRange;
      session.activeBoundary =
        compareSelectionBoundaries(doc, movingBoundary, fixedBoundary) < 0 ? 'start' : 'end';
      paintMobileSelection();
      reportMobileSelection();
      const surface = surfaceRef.current;
      const positions = surface && getMobileSelectionHandlePositions(nextRange, surface);
      if (positions) {
        const nextHandles = commit
          ? positions
          : alignMobileSelectionHandlesToActiveDrag(positions, session);
        nextHandles.dragging = commit ? null : endpoint;
        if (!commit && visualPoint && surface) {
          const surfaceRect = surface.getBoundingClientRect();
          nextHandles[endpoint] = {
            left: Math.max(0, Math.min(surfaceRect.width, visualPoint.clientX - surfaceRect.left)),
            top: Math.max(0, Math.min(surfaceRect.height, visualPoint.clientY - surfaceRect.top)),
          };
        }
        setMobileSelectionHandles(nextHandles);
      }
    } catch {
      // A section reload can invalidate an endpoint during cleanup.
    }
  };
  const canTurnMobileSelectionPage = (direction: MobileSelectionPageDirection) => {
    const { page, pages } = view.renderer;
    if (
      typeof page !== 'number' ||
      typeof pages !== 'number' ||
      !Number.isFinite(page) ||
      !Number.isFinite(pages)
    )
      return false;
    return direction === 'next' ? page < pages - 2 : page > 1;
  };
  const performMobileSelectionPageTurn = async (
    direction: MobileSelectionPageDirection,
    endpoint: MobileSelectionHandleEndpoint,
  ) => {
    const session = mobileSelectionSession;
    const fixedBoundary = mobileSelectionDragFixedBoundary;
    const pageBeforeTurn = view.renderer.page;
    if (
      !session ||
      !fixedBoundary ||
      mobileSelectionPageTurnInFlight ||
      !canTurnMobileSelectionPage(direction)
    ) {
      clearMobileSelectionPageTurnTimer();
      mobileSelectionLatestEdgeDrag = null;
      return;
    }
    const contentBeforeTurn = getFoliateContents(view).find(
      (content) => content.doc === session.doc && content.index === session.index,
    );
    if (!contentBeforeTurn) return;

    clearMobileSelectionPageTurnTimer();
    clearMobileSelectionDragFrame();
    mobileSelectionLatestEdgeDrag = null;
    mobileSelectionPageTurnInFlight = true;
    view.renderer.setTouchPagingBlocked?.(false);
    try {
      await (direction === 'next' ? view.next() : view.prev());
      if (isDisposed() || mobileSelectionSession !== session) return;
      const pageAfterTurn = view.renderer.page;
      if (
        typeof pageBeforeTurn !== 'number' ||
        typeof pageAfterTurn !== 'number' ||
        pageAfterTurn !== pageBeforeTurn + (direction === 'next' ? 1 : -1)
      )
        return;
      const contentAfterTurn = getFoliateContents(view).find(
        (content) => content.doc === session.doc && content.index === session.index,
      );
      const visibleRange = getVisibleRange();
      if (!contentAfterTurn || !visibleRange) return;
      const movingBoundary = getInclusiveVisiblePageBoundary(doc, visibleRange, direction);
      const nextRange = createRangeBetweenBoundaries(doc, fixedBoundary, movingBoundary);
      if (nextRange.collapsed || !nextRange.toString().trim()) return;

      session.range = nextRange;
      session.activeBoundary =
        compareSelectionBoundaries(doc, movingBoundary, fixedBoundary) < 0 ? 'start' : 'end';
      paintMobileSelection();
      reportMobileSelection();
      const dragStillActive = mobileSelectionDragEndpoint === endpoint;
      mobileSelectionEdgeContinuationDirection = dragStillActive ? direction : null;
      mobileSelectionPageTurnNeedsRearm = dragStillActive;
      mobileSelectionLatestEdgeDrag = null;
      syncMobileSelectionHandles();
    } catch {
      // Keep the last valid selection if Foliate rejects a page turn.
    } finally {
      mobileSelectionPageTurnInFlight = false;
      if (
        !isDisposed() &&
        mobileSelectionSession === session &&
        touchPagingSelectionLockedRef.current
      )
        view.renderer.setTouchPagingBlocked?.(true);
    }
  };
  const updateMobileSelectionPageTurnHold = (
    endpoint: MobileSelectionHandleEndpoint,
    direction: MobileSelectionPageDirection | null,
  ) => {
    if (!direction) {
      clearMobileSelectionPageTurnTimer();
      mobileSelectionLatestEdgeDrag = null;
      mobileSelectionPageTurnNeedsRearm = false;
      mobileSelectionEdgeContinuationDirection = null;
      return;
    }
    mobileSelectionLatestEdgeDrag = { endpoint, direction };
    if (mobileSelectionPageTurnNeedsRearm || mobileSelectionPageTurnInFlight) {
      clearMobileSelectionPageTurnTimer();
      return;
    }
    if (mobileSelectionPageTurnTimer !== null && mobileSelectionPageTurnDirection === direction)
      return;
    clearMobileSelectionPageTurnTimer();
    if (!canTurnMobileSelectionPage(direction)) return;
    mobileSelectionPageTurnDirection = direction;
    mobileSelectionPageTurnTimer = window.setTimeout(() => {
      mobileSelectionPageTurnTimer = null;
      mobileSelectionPageTurnDirection = null;
      const latest = mobileSelectionLatestEdgeDrag;
      if (
        latest?.endpoint === endpoint &&
        latest.direction === direction &&
        mobileSelectionDragEndpoint === endpoint
      )
        void performMobileSelectionPageTurn(direction, endpoint);
    }, MOBILE_SELECTION_PAGE_EDGE_HOLD_MS);
  };
  const updateMobileSelectionFromOuterPoint = (
    endpoint: MobileSelectionHandleEndpoint,
    clientX: number,
    clientY: number,
    commit: boolean,
  ) => {
    if (mobileSelectionPageTurnInFlight) return;
    const edgeDirection = getOuterPageEdgeDirection(clientY);
    const continueFromTurn = Boolean(
      edgeDirection && mobileSelectionEdgeContinuationDirection === edgeDirection,
    );
    if (!continueFromTurn) {
      mobileSelectionEdgeContinuationDirection = null;
      const boundary = getBoundaryAtOuterPoint(clientX, clientY);
      if (boundary) applyMobileSelectionBoundary(endpoint, boundary, commit, { clientX, clientY });
    }
    if (commit) {
      resetMobileSelectionPageTurnState();
    } else {
      updateMobileSelectionPageTurnHold(endpoint, edgeDirection);
    }
  };
  const startMobileSelectionDrag = (endpoint: MobileSelectionHandleEndpoint) => {
    const session = mobileSelectionSession;
    if (!session) return;
    clearMobileSelectionDragFrame();
    resetMobileSelectionPageTurnState();
    mobileSelectionTouchPivot = null;
    mobileSelectionDragEndpoint = endpoint;
    mobileSelectionDragFixedBoundary =
      endpoint === 'start'
        ? cloneSelectionBoundary(session.range.endContainer, session.range.endOffset)
        : cloneSelectionBoundary(session.range.startContainer, session.range.startOffset);
    setMobileSelectionHandles((current) =>
      current ? { ...current, dragging: endpoint } : current,
    );
    lockTouchPagingForSelection();
    suppressCenterTapUntil = performance.now() + 450;
  };
  const moveMobileSelectionDrag = (
    endpoint: MobileSelectionHandleEndpoint,
    clientX: number,
    clientY: number,
  ) => {
    if (
      !mobileSelectionSession ||
      mobileSelectionPageTurnInFlight ||
      mobileSelectionDragEndpoint !== endpoint ||
      !mobileSelectionDragFixedBoundary
    )
      return;
    mobileSelectionDragPoint = { endpoint, clientX, clientY };
    if (mobileSelectionDragFrame) return;
    mobileSelectionDragFrame = window.requestAnimationFrame(() => {
      mobileSelectionDragFrame = 0;
      const point = mobileSelectionDragPoint;
      mobileSelectionDragPoint = null;
      if (point)
        updateMobileSelectionFromOuterPoint(point.endpoint, point.clientX, point.clientY, false);
    });
  };
  const endMobileSelectionDrag = (
    endpoint: MobileSelectionHandleEndpoint,
    clientX: number,
    clientY: number,
  ) => {
    if (mobileSelectionDragEndpoint !== endpoint) return;
    clearMobileSelectionDragFrame();
    updateMobileSelectionFromOuterPoint(endpoint, clientX, clientY, true);
    resetMobileSelectionPageTurnState();
    mobileSelectionDragEndpoint = null;
    mobileSelectionDragFixedBoundary = null;
    syncMobileSelectionHandles();
  };
  const cancelMobileSelectionDrag = () => {
    clearMobileSelectionDragFrame();
    resetMobileSelectionPageTurnState();
    mobileSelectionDragEndpoint = null;
    mobileSelectionDragFixedBoundary = null;
    syncMobileSelectionHandles();
  };
  const clearThisDocumentMobileSelection = () => {
    clearMobileSelection();
    unlockTouchPagingForSelection();
  };
  const mobileSelectionController: MobileSelectionController = {
    clear: clearThisDocumentMobileSelection,
    refresh: refreshMobileSelection,
    startDrag: startMobileSelectionDrag,
    moveDrag: moveMobileSelectionDrag,
    endDrag: endMobileSelectionDrag,
    cancelDrag: cancelMobileSelectionDrag,
  };
  clearMobileSelectionRef.current = clearThisDocumentMobileSelection;
  mobileSelectionControllerRef.current = mobileSelectionController;

  const beginCustomMobileSelection = () => {
    if (mobileSelectionSession || !pendingPress) return false;
    const customMobileSelectionOverlayer = getFoliateContents(view).find(
      (content) => content.doc === doc,
    )?.overlayer;
    if (!customMobileSelectionOverlayer) return false;
    const wordRange = createWordRangeAtPoint(
      doc,
      pendingPress.boundary,
      pendingPress.clientX,
      pendingPress.clientY,
    );
    if (!wordRange) return false;
    const range = constrainRangeToVisibleRange(doc, wordRange, getVisibleRange());
    if (!range || range.collapsed || !range.toString().trim()) return false;
    mobileSelectionSession = {
      doc,
      index,
      range,
      overlayer: customMobileSelectionOverlayer,
      activeBoundary: 'end',
    };
    hasCustomMobileSelectionRef.current = true;
    mobileSelectionTouchPivot = range.cloneRange();
    mobileSelectionDragEndpoint = null;
    mobileSelectionDragFixedBoundary = null;
    if (!paintMobileSelection()) {
      mobileSelectionSession = null;
      mobileSelectionTouchPivot = null;
      hasCustomMobileSelectionRef.current = false;
      return false;
    }
    syncMobileSelectionHandles();
    lockTouchPagingForSelection();
    markMobileTouchSelection(touchSelectionGesture);
    scrubNativeSelection();
    reportMobileSelection();
    return true;
  };
  const updateCustomMobileSelectionFromTouch = (touch: Touch, commit: boolean) => {
    if (mobileSelectionPageTurnInFlight) return;
    const session = mobileSelectionSession;
    const pivot = mobileSelectionTouchPivot;
    const edgeDirection = getDocumentPageEdgeDirection(touch.clientY);
    const visibleRange = getVisibleRange();
    const movingBoundary =
      getBoundaryAtDocumentPoint(touch.clientX, touch.clientY) ??
      (visibleRange && edgeDirection
        ? cloneSelectionBoundary(
            edgeDirection === 'prev' ? visibleRange.startContainer : visibleRange.endContainer,
            edgeDirection === 'prev' ? visibleRange.startOffset : visibleRange.endOffset,
          )
        : null);
    if (!session || !pivot || !movingBoundary) return;
    const pivotStart = cloneSelectionBoundary(pivot.startContainer, pivot.startOffset);
    const pivotEnd = cloneSelectionBoundary(pivot.endContainer, pivot.endOffset);
    const beforePivot = compareSelectionBoundaries(doc, movingBoundary, pivotStart) < 0;
    const afterPivot = compareSelectionBoundaries(doc, movingBoundary, pivotEnd) > 0;
    if (!beforePivot && !afterPivot) {
      resetMobileSelectionPageTurnState();
      session.range = pivot.cloneRange();
      session.activeBoundary = 'end';
      paintMobileSelection();
      reportMobileSelection();
      const surface = surfaceRef.current;
      const positions = surface && getMobileSelectionHandlePositions(session.range, surface);
      if (positions) setMobileSelectionHandles(positions);
      mobileSelectionDragEndpoint = null;
      mobileSelectionDragFixedBoundary = null;
      return;
    }
    const endpoint: MobileSelectionHandleEndpoint = beforePivot ? 'start' : 'end';
    mobileSelectionDragEndpoint = endpoint;
    mobileSelectionDragFixedBoundary = beforePivot ? pivotEnd : pivotStart;
    const continueFromTurn = Boolean(
      edgeDirection && mobileSelectionEdgeContinuationDirection === edgeDirection,
    );
    if (!continueFromTurn) {
      mobileSelectionEdgeContinuationDirection = null;
      applyMobileSelectionBoundary(endpoint, movingBoundary, commit);
    }
    if (commit) {
      resetMobileSelectionPageTurnState();
    } else {
      updateMobileSelectionPageTurnHold(endpoint, edgeDirection);
    }
  };
  const finishCustomMobileTouchSelection = () => {
    clearMobileSelectionDragFrame();
    resetMobileSelectionPageTurnState();
    mobileSelectionTouchPivot = null;
    mobileSelectionDragEndpoint = null;
    mobileSelectionDragFixedBoundary = null;
    syncMobileSelectionHandles();
    reportMobileSelection();
  };
  const handleTouchStartCapture = (touchEvent: TouchEvent) => {
    clearTouchSelectionTimer();
    customSelectionHoldCanceled = false;
    const touch = touchEvent.touches.length === 1 ? touchEvent.touches[0] : null;
    if (mobileSelectionSession) {
      clearThisDocumentMobileSelection();
      suppressCenterTapUntil = performance.now() + 450;
    }
    const selectionActive = hasDocumentSelection();
    pendingPress =
      customMobileSelectionEnabled && touch && !selectionActive
        ? (() => {
            const boundary = getBoundaryAtDocumentPoint(touch.clientX, touch.clientY);
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
      clearTouchPagingUnlockTimer();
      lockTouchPagingForSelection();
    } else if (touchPagingUnlockTimer !== null) {
      // A collapsed selection used to leave mobile paging locked until the
      // debounce expired. A new gesture is definitive user intent, so make
      // that gesture eligible for paging immediately.
      unlockTouchPagingForSelection();
    }
    const selectionPagingLocked = touchPagingSelectionLockedRef.current;
    touchStartContainerPosition = touch ? view.renderer.containerPosition : null;
    touchSelectionGesture = touch
      ? createMobileTouchGesture({
          startedAt: performance.now(),
          startX: touch.clientX,
          startY: touch.clientY,
          hasSelection: selectionActive || selectionPagingLocked,
        })
      : null;
    if (touchSelectionGesture?.intent === 'selection') {
      touchEvent.stopImmediatePropagation();
      return;
    }
    if (touchSelectionGesture) {
      const pendingGesture = touchSelectionGesture;
      touchSelectionTimer = window.setTimeout(() => {
        const customHoldReady = customMobileSelectionEnabled && !customSelectionHoldCanceled;
        if (
          touchSelectionGesture === pendingGesture &&
          (pendingGesture.intent === 'pending' || customHoldReady)
        ) {
          if (!customMobileSelectionEnabled || (customHoldReady && beginCustomMobileSelection())) {
            markMobileTouchSelection(pendingGesture);
            // Foliate enters its paging state on touchstart. Restore the
            // exact page as soon as the long press becomes our selection.
            lockTouchPagingForSelection();
            suppressCenterTapUntil = performance.now() + 450;
          } else {
            touchSelectionGesture = null;
            pendingPress = null;
            scheduleTouchPagingUnlock();
          }
        }
        touchSelectionTimer = null;
      }, MOBILE_TEXT_SELECTION_HOLD_MS);
    }
  };
  const handleSelectStartCapture = (selectionEvent: Event) => {
    if (customMobileSelectionEnabled) {
      if (selectionEvent.cancelable) selectionEvent.preventDefault();
      if (!mobileSelectionSession) beginCustomMobileSelection();
      scrubNativeSelection();
      markMobileTouchSelection(touchSelectionGesture);
      clearTouchSelectionTimer();
      suppressCenterTapUntil = performance.now() + 450;
      selectionEvent.stopImmediatePropagation();
      return;
    }
    if (compactLayoutRef.current || touchSelectionGesture) {
      lockTouchPagingForSelection();
      selectionEvent.stopImmediatePropagation();
    }
    markMobileTouchSelection(touchSelectionGesture);
    clearTouchSelectionTimer();
  };
  const handleTouchMoveCapture = (touchEvent: TouchEvent) => {
    const gesture = touchSelectionGesture;
    const touch = pendingPress
      ? Array.from(touchEvent.touches).find(
          (candidate) => candidate.identifier === pendingPress?.touchIdentifier,
        )
      : touchEvent.touches[0];
    if (!gesture || !touch) return;
    if (mobileSelectionSession) {
      clearTouchSelectionTimer();
      markMobileTouchSelection(gesture);
      lockTouchPagingForSelection();
      updateCustomMobileSelectionFromTouch(touch, false);
      suppressCenterTapUntil = performance.now() + 450;
      if (touchEvent.cancelable) touchEvent.preventDefault();
      touchEvent.stopImmediatePropagation();
      return;
    }
    const elapsed = performance.now() - gesture.startedAt;
    const distance = Math.hypot(touch.clientX - gesture.startX, touch.clientY - gesture.startY);
    if (
      customMobileSelectionEnabled &&
      gesture.intent === 'pending' &&
      elapsed < MOBILE_TEXT_SELECTION_HOLD_MS &&
      distance >= MOBILE_CUSTOM_SELECTION_SLOP_PX
    ) {
      customSelectionHoldCanceled = true;
      clearTouchSelectionTimer();
      pendingPress = null;
      touchSelectionGesture = null;
      return;
    }
    const previousIntent = gesture.intent;
    const intent = resolveMobileTouchMove({
      gesture,
      currentX: touch.clientX,
      currentY: touch.clientY,
      currentTime: performance.now(),
      hasSelection: hasDocumentSelection() || touchPagingSelectionLockedRef.current,
    });
    if (intent === 'selection' && previousIntent !== 'selection') {
      lockTouchPagingForSelection();
    }
    if (
      customMobileSelectionEnabled &&
      intent === 'selection' &&
      elapsed >= MOBILE_TEXT_SELECTION_HOLD_MS &&
      beginCustomMobileSelection()
    ) {
      updateCustomMobileSelectionFromTouch(touch, false);
      clearTouchSelectionTimer();
      if (touchEvent.cancelable) touchEvent.preventDefault();
      touchEvent.stopImmediatePropagation();
      return;
    }
    if (
      Math.abs(touch.clientX - gesture.startX) >= 8 ||
      Math.abs(touch.clientY - gesture.startY) >= 8
    )
      suppressCenterTapUntil = performance.now() + 450;
    if (intent !== 'pending') suppressCenterTapUntil = performance.now() + 450;
    if (intent !== 'pending' && !customMobileSelectionEnabled) clearTouchSelectionTimer();
    if (intent !== 'page-turn') {
      if (customMobileSelectionEnabled && touchEvent.cancelable) touchEvent.preventDefault();
      touchEvent.stopImmediatePropagation();
    }
  };
  const handleTouchEndCapture = (touchEvent: TouchEvent) => {
    const gesture = touchSelectionGesture;
    const endedTouch = pendingPress
      ? Array.from(touchEvent.changedTouches).find(
          (candidate) => candidate.identifier === pendingPress?.touchIdentifier,
        )
      : touchEvent.changedTouches[0];
    if (
      customMobileSelectionEnabled &&
      !mobileSelectionSession &&
      gesture &&
      !customSelectionHoldCanceled &&
      performance.now() - gesture.startedAt >= MOBILE_TEXT_SELECTION_HOLD_MS
    )
      beginCustomMobileSelection();
    if (mobileSelectionSession) {
      if (endedTouch) updateCustomMobileSelectionFromTouch(endedTouch, true);
      finishCustomMobileTouchSelection();
      touchSelectionGesture = null;
      touchStartContainerPosition = null;
      pendingPress = null;
      clearTouchSelectionTimer();
      lockTouchPagingForSelection();
      suppressCenterTapUntil = performance.now() + 450;
      if (touchEvent.cancelable) touchEvent.preventDefault();
      touchEvent.stopImmediatePropagation();
      return;
    }
    const shouldKeepSelection = shouldPreserveMobileTextSelection({
      gesture,
      currentTime: performance.now(),
      hasSelection: hasDocumentSelection() || touchPagingSelectionLockedRef.current,
    });
    if (gesture?.intent !== 'pending' || shouldKeepSelection) {
      suppressCenterTapUntil = performance.now() + 450;
    }
    if (shouldKeepSelection) {
      lockTouchPagingForSelection();
    }
    touchSelectionGesture = null;
    touchStartContainerPosition = null;
    pendingPress = null;
    clearTouchSelectionTimer();
    if (!hasDocumentSelection()) scheduleTouchPagingUnlock();
    if (shouldKeepSelection) touchEvent.stopImmediatePropagation();
  };
  const handleTouchCancelCapture = (touchEvent: TouchEvent) => {
    const gesture = touchSelectionGesture;
    if (mobileSelectionSession) {
      finishCustomMobileTouchSelection();
      touchSelectionGesture = null;
      touchStartContainerPosition = null;
      pendingPress = null;
      clearTouchSelectionTimer();
      lockTouchPagingForSelection();
      suppressCenterTapUntil = performance.now() + 450;
      if (touchEvent.cancelable) touchEvent.preventDefault();
      touchEvent.stopImmediatePropagation();
      return;
    }
    const selectionActive = touchPagingSelectionLockedRef.current || hasDocumentSelection();
    // Mobile WebKit can emit touchcancel before exposing the native text
    // selection. Since the browser cancelled the gesture, pagination must
    // never settle on an adjacent page, even if early movement briefly
    // looked like a horizontal page turn.
    const shouldCancelPaging = Boolean(gesture) || selectionActive;
    if (shouldCancelPaging) {
      suppressCenterTapUntil = performance.now() + 450;
      if (selectionActive || gesture?.intent !== 'page-turn') {
        lockTouchPagingForSelection();
      } else {
        restoreTouchStartPosition();
      }
    }
    touchSelectionGesture = null;
    touchStartContainerPosition = null;
    pendingPress = null;
    clearTouchSelectionTimer();
    if (!hasDocumentSelection()) scheduleTouchPagingUnlock();
    if (shouldCancelPaging) touchEvent.stopImmediatePropagation();
  };
  const handleContextMenu = (contextMenuEvent: Event) => {
    contextMenuEvent.preventDefault();
    if (customMobileSelectionEnabled) {
      beginCustomMobileSelection();
      scrubNativeSelection();
      markMobileTouchSelection(touchSelectionGesture);
      clearTouchSelectionTimer();
      suppressCenterTapUntil = performance.now() + 450;
      contextMenuEvent.stopImmediatePropagation();
      return;
    }
    if (!compactLayoutRef.current) return;
    // Android Chrome may announce a native long press through contextmenu
    // before its Selection is observable. Treat it as selection intent so
    // a synthetic mouse pointer cannot settle or auto-turn the page.
    lockTouchPagingForSelection();
    markMobileTouchSelection(touchSelectionGesture);
    clearTouchSelectionTimer();
    suppressCenterTapUntil = performance.now() + 450;
    contextMenuEvent.stopImmediatePropagation();
  };

  const handleSelectionChange = () => {
    const selection = doc.defaultView?.getSelection();
    if (mobileSelectionSession) {
      if (selection?.rangeCount) removeNativeSelection();
      reportMobileSelection();
      return;
    }
    if (customMobileSelectionEnabled) {
      if (selection?.rangeCount) {
        beginCustomMobileSelection();
        removeNativeSelection();
      }
      if (mobileSelectionSession) reportMobileSelection();
      return;
    }
    if (mobileSelectionProgrammatic) return;
    const selectionActive = hasActiveTextSelection(selection);
    const mobileSelectionActive =
      compactLayoutRef.current ||
      touchPagingSelectionLockedRef.current ||
      touchSelectionGesture !== null;
    if (selectionActive) {
      if (mobileSelectionActive) {
        lockTouchPagingForSelection();
      }
      markMobileTouchSelection(touchSelectionGesture);
      clearTouchSelectionTimer();
    } else if (!touchSelectionGesture) {
      scheduleTouchPagingUnlock();
    }
    selectionReporter.report(view, doc, index);
  };
  const handlePointerDown = () => onContentInteractionRef.current();
  const handleClick = (mouseEvent: MouseEvent) => {
    if (
      performance.now() < suppressCenterTapUntil ||
      isBlockedInteractionTarget(mouseEvent.target) ||
      hasActiveTextSelection(doc.defaultView?.getSelection())
    )
      return;
    const match = findFoliateHighlightAtPoint({
      view,
      doc,
      sectionIndex: index,
      highlights: highlightsRef.current,
      preferences: preferencesRef.current,
      x: mouseEvent.clientX,
      y: mouseEvent.clientY,
    });
    if (match) {
      onHighlightClickRef.current({
        highlightId: match.highlight.id,
        rect: rangeToViewportRect(match.range),
      });
      return;
    }
    if (!compactLayoutRef.current) return;
    onCenterTapRef.current();
  };
  const handleKeyUp = (keyboardEvent: KeyboardEvent) => {
    if (
      keyboardEvent.defaultPrevented ||
      keyboardEvent.metaKey ||
      keyboardEvent.ctrlKey ||
      keyboardEvent.altKey ||
      isEditingTarget(keyboardEvent.target)
    )
      return;
    if (keyboardEvent.key === 'ArrowLeft' || keyboardEvent.key === 'ArrowUp') {
      keyboardEvent.preventDefault();
      turnPage('prev');
    } else if (keyboardEvent.key === 'ArrowRight' || keyboardEvent.key === 'ArrowDown') {
      keyboardEvent.preventDefault();
      turnPage('next');
    }
  };
  doc.addEventListener('selectionchange', handleSelectionChange, true);
  doc.addEventListener('selectstart', handleSelectStartCapture, true);
  doc.addEventListener('touchstart', handleTouchStartCapture, { capture: true, passive: true });
  doc.addEventListener('touchmove', handleTouchMoveCapture, { capture: true, passive: false });
  doc.addEventListener('touchend', handleTouchEndCapture, { capture: true, passive: false });
  doc.addEventListener('touchcancel', handleTouchCancelCapture, {
    capture: true,
    passive: false,
  });
  doc.addEventListener('contextmenu', handleContextMenu);
  doc.addEventListener('pointerdown', handlePointerDown);
  doc.addEventListener('click', handleClick);
  doc.addEventListener('keyup', handleKeyUp);
  doc.addEventListener('wheel', handleWheel, { passive: false });
  registerCleanup(() => {
    clearTouchSelectionTimer();
    clearTouchPagingUnlockTimer();
    clearMobileSelection(false);
    clearMobileSelectionScrubFrame();
    clearMobileSelectionProgrammaticTimer();
    mobileSelectionProgrammatic = false;
    doc.documentElement.classList.remove(MOBILE_CUSTOM_SELECTION_CLASS);
    if (clearMobileSelectionRef.current === clearThisDocumentMobileSelection) {
      clearMobileSelectionRef.current = () => undefined;
    }
    if (mobileSelectionControllerRef.current === mobileSelectionController) {
      mobileSelectionControllerRef.current = null;
    }
    doc.removeEventListener('selectionchange', handleSelectionChange, true);
    doc.removeEventListener('selectstart', handleSelectStartCapture, true);
    doc.removeEventListener('touchstart', handleTouchStartCapture, true);
    doc.removeEventListener('touchmove', handleTouchMoveCapture, true);
    doc.removeEventListener('touchend', handleTouchEndCapture, true);
    doc.removeEventListener('touchcancel', handleTouchCancelCapture, true);
    doc.removeEventListener('contextmenu', handleContextMenu);
    doc.removeEventListener('pointerdown', handlePointerDown);
    doc.removeEventListener('click', handleClick);
    doc.removeEventListener('keyup', handleKeyUp);
    doc.removeEventListener('wheel', handleWheel);
  });

  const selectedFont = resolveReaderStyle(preferencesRef.current).fontFamily;
  void ensureReaderFontStylesheet(doc, selectedFont)
    .then(() => doc.fonts?.ready)
    .then(() => {
      if (isDisposed() || resolveReaderStyle(preferencesRef.current).fontFamily !== selectedFont)
        return;
      applyFoliateReaderStyle(view, preferencesRef.current, compactLayoutRef.current);
    });
}
