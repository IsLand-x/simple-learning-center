import type { FoliateOverlayRect, Overlayer as FoliateOverlayer } from 'foliate-js/overlayer.js';
import type { ReaderFoliateAnnotation } from '../../../lib/foliateReader';

export interface FoliateLoadDetail {
  doc: Document;
  index: number;
}

export interface FoliateDrawAnnotationDetail {
  annotation: ReaderFoliateAnnotation;
  draw: (
    draw: (rects: FoliateOverlayRect[]) => SVGElement,
    options?: Record<string, unknown>,
  ) => void;
}

export interface FoliateShowAnnotationDetail {
  value: string;
  range: Range;
}

export interface TrackpadState {
  lastEventAt: number;
  velocityX: number;
  velocityY: number;
  snapping: boolean;
  snapTimer: number | null;
}

export interface SelectionBoundary {
  node: Node;
  offset: number;
}

export type MobileSelectionHandleEndpoint = 'start' | 'end';

interface MobileSelectionHandlePoint {
  left: number;
  top: number;
}

export interface MobileSelectionHandlesState {
  start: MobileSelectionHandlePoint | null;
  end: MobileSelectionHandlePoint | null;
  dragging: MobileSelectionHandleEndpoint | null;
}

export interface MobileSelectionSession {
  doc: Document;
  index: number;
  range: Range;
  overlayer: FoliateOverlayer;
  activeBoundary: MobileSelectionHandleEndpoint;
}

export interface MobileSelectionController {
  clear: () => void;
  refresh: () => void;
  startDrag: (endpoint: MobileSelectionHandleEndpoint) => void;
  moveDrag: (endpoint: MobileSelectionHandleEndpoint, clientX: number, clientY: number) => void;
  endDrag: (endpoint: MobileSelectionHandleEndpoint, clientX: number, clientY: number) => void;
  cancelDrag: () => void;
}

export interface MobileSelectionPointerDrag {
  pointerId: number;
  endpoint: MobileSelectionHandleEndpoint;
  grabOffsetX: number;
  grabOffsetY: number;
}

export type MobileSelectionPageDirection = 'prev' | 'next';
