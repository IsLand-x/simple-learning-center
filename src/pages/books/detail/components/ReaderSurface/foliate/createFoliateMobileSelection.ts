import { markMobileTouchSelection } from '../gestures';
import {
  MOBILE_CUSTOM_HIGHLIGHT_NAME,
  MOBILE_CUSTOM_SELECTION_CLASS,
  MOBILE_SELECTION_PAGE_EDGE_HOLD_MS,
} from './constants';
import type { createFoliateSelectionPaging } from './createFoliateSelectionPaging';
import type {
  FoliateDocumentInteractionsOptions,
  FoliateGestureState,
} from './documentInteractionTypes';
import { hasActiveTextSelection } from './interactionHelpers';
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
import { drawFoliateActiveSelection, getFoliateContents } from './readerAdapter';
import type {
  MobileSelectionController,
  MobileSelectionHandleEndpoint,
  MobileSelectionHandlesState,
  MobileSelectionPageDirection,
  MobileSelectionSession,
  SelectionBoundary,
} from './runtimeTypes';

export function createFoliateMobileSelection(
  options: Pick<
    FoliateDocumentInteractionsOptions,
    | 'view'
    | 'doc'
    | 'index'
    | 'isDisposed'
    | 'surfaceRef'
    | 'preferencesRef'
    | 'touchPagingSelectionLockedRef'
    | 'hasCustomMobileSelectionRef'
    | 'clearMobileSelectionRef'
    | 'mobileSelectionControllerRef'
    | 'mobileSelectionPointerDragRef'
    | 'setMobileSelectionHandles'
    | 'selectionReporter'
  >,
  input: FoliateGestureState,
  paging: ReturnType<typeof createFoliateSelectionPaging>,
) {
  const {
    view,
    doc,
    index,
    isDisposed,
    surfaceRef,
    preferencesRef,
    touchPagingSelectionLockedRef,
    hasCustomMobileSelectionRef,
    clearMobileSelectionRef,
    mobileSelectionControllerRef,
    mobileSelectionPointerDragRef,
    setMobileSelectionHandles,
    selectionReporter,
  } = options;

  // Foliate dispatches `load` before it creates and attaches the document
  // overlayer. Only decide whether this document needs custom selection
  // here; resolve the overlayer lazily when the long press actually fires.
  const customMobileSelectionEnabled = shouldUseCustomMobileSelection(doc);
  if (customMobileSelectionEnabled)
    doc.documentElement.classList.add(MOBILE_CUSTOM_SELECTION_CLASS);

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

  const hasDocumentSelection = () =>
    Boolean(mobileSelectionSession) || hasActiveTextSelection(doc.defaultView?.getSelection());

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
    input.pendingPress = null;
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
    paging.lockTouchPagingForSelection();
    input.suppressCenterTapUntil = performance.now() + 450;
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
    paging.unlockTouchPagingForSelection();
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
    if (mobileSelectionSession || !input.pendingPress) return false;
    const customMobileSelectionOverlayer = getFoliateContents(view).find(
      (content) => content.doc === doc,
    )?.overlayer;
    if (!customMobileSelectionOverlayer) return false;
    const wordRange = createWordRangeAtPoint(
      doc,
      input.pendingPress.boundary,
      input.pendingPress.clientX,
      input.pendingPress.clientY,
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
    paging.lockTouchPagingForSelection();
    markMobileTouchSelection(input.touchSelectionGesture);
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
  const dispose = () => {
    clearMobileSelection(false);
    clearMobileSelectionScrubFrame();
    clearMobileSelectionProgrammaticTimer();
    mobileSelectionProgrammatic = false;
    doc.documentElement.classList.remove(MOBILE_CUSTOM_SELECTION_CLASS);
    if (clearMobileSelectionRef.current === clearThisDocumentMobileSelection)
      clearMobileSelectionRef.current = () => undefined;
    if (mobileSelectionControllerRef.current === mobileSelectionController)
      mobileSelectionControllerRef.current = null;
  };
  return {
    customMobileSelectionEnabled,
    hasDocumentSelection,
    getBoundaryAtDocumentPoint,
    clearThisDocumentMobileSelection,
    beginCustomMobileSelection,
    scrubNativeSelection,
    updateCustomMobileSelectionFromTouch,
    finishCustomMobileTouchSelection,
    removeNativeSelection,
    reportMobileSelection,
    hasCustomSelection: () => mobileSelectionSession !== null,
    isProgrammatic: () => mobileSelectionProgrammatic,
    dispose,
  };
}
