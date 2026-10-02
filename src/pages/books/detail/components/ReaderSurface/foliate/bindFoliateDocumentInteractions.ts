import { ensureReaderFontStylesheet } from '../../../../../../util/reading/readerFonts';
import { resolveReaderStyle } from '../../../../../../util/reading/readerThemes';
import { createFoliateGestureInput } from './createFoliateGestureInput';
import { createFoliateMobileSelection } from './createFoliateMobileSelection';
import { createFoliateSelectionPaging } from './createFoliateSelectionPaging';
import type {
  FoliateDocumentInteractionsOptions,
  FoliateGestureState,
} from './documentInteractionTypes';
import {
  findFoliateHighlightAtPoint,
  hasActiveTextSelection,
  isBlockedInteractionTarget,
  isEditingTarget,
} from './interactionHelpers';
import { applyFoliateReaderStyle, rangeToViewportRect } from './readerAdapter';

// This entry owns every document listener and invokes each controller's cleanup once.
export function bindFoliateDocumentInteractions(options: FoliateDocumentInteractionsOptions) {
  const {
    view,
    doc,
    index,
    isDisposed,
    highlightsRef,
    compactLayoutRef,
    preferencesRef,
    onHighlightClickRef,
    onContentInteractionRef,
    onCenterTapRef,
    handleWheel,
    turnPage,
    registerCleanup,
  } = options;
  const input: FoliateGestureState = {
    touchSelectionGesture: null,
    touchStartContainerPosition: null,
    pendingPress: null,
    suppressCenterTapUntil: 0,
  };
  const paging = createFoliateSelectionPaging(options, input, () =>
    selection.hasDocumentSelection(),
  );
  const selection = createFoliateMobileSelection(options, input, paging);
  const gestures = createFoliateGestureInput(options, input, selection, paging);

  const handlePointerDown = () => onContentInteractionRef.current();

  const handleClick = (mouseEvent: MouseEvent) => {
    if (
      performance.now() < input.suppressCenterTapUntil ||
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
  doc.addEventListener('selectionchange', gestures.handleSelectionChange, true);

  doc.addEventListener('selectstart', gestures.handleSelectStartCapture, true);

  doc.addEventListener('touchstart', gestures.handleTouchStartCapture, {
    capture: true,
    passive: true,
  });

  doc.addEventListener('touchmove', gestures.handleTouchMoveCapture, {
    capture: true,
    passive: false,
  });

  doc.addEventListener('touchend', gestures.handleTouchEndCapture, {
    capture: true,
    passive: false,
  });

  doc.addEventListener('touchcancel', gestures.handleTouchCancelCapture, {
    capture: true,
    passive: false,
  });

  doc.addEventListener('contextmenu', gestures.handleContextMenu);

  doc.addEventListener('pointerdown', handlePointerDown);

  doc.addEventListener('click', handleClick);

  doc.addEventListener('keyup', handleKeyUp);

  doc.addEventListener('wheel', handleWheel, { passive: false });

  registerCleanup(() => {
    gestures.clearTouchSelectionTimer();
    paging.clearTouchPagingUnlockTimer();
    selection.dispose();
    doc.removeEventListener('selectionchange', gestures.handleSelectionChange, true);
    doc.removeEventListener('selectstart', gestures.handleSelectStartCapture, true);
    doc.removeEventListener('touchstart', gestures.handleTouchStartCapture, true);
    doc.removeEventListener('touchmove', gestures.handleTouchMoveCapture, true);
    doc.removeEventListener('touchend', gestures.handleTouchEndCapture, true);
    doc.removeEventListener('touchcancel', gestures.handleTouchCancelCapture, true);
    doc.removeEventListener('contextmenu', gestures.handleContextMenu);
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
