import type { View as FoliateView } from 'foliate-js/view.js';
import type { Dispatch, SetStateAction } from 'react';
import type { HighlightItem, ReaderPreferences } from '../../../../../../../contracts/reading';
import type { ReaderHighlightTarget } from '../../../../../../types/reader';
import { type MobileTouchGesture } from '../gestures';
import type {
  MobileSelectionController,
  MobileSelectionHandlesState,
  MobileSelectionPointerDrag,
  SelectionBoundary,
} from './runtimeTypes';
import type { FoliateSelectionReporter } from './selectionReporter';
type MutableReaderRef<T> = { current: T };
export interface FoliateDocumentInteractionsOptions {
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

export interface FoliateGestureState {
  touchSelectionGesture: MobileTouchGesture | null;
  touchStartContainerPosition: number | null;
  pendingPress: {
    boundary: SelectionBoundary;
    clientX: number;
    clientY: number;
    touchIdentifier: number;
  } | null;
  suppressCenterTapUntil: number;
}
