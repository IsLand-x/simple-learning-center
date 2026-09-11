import type { PointerEvent as ReactPointerEvent } from 'react';
import { MOBILE_SELECTION_HANDLE_ANCHOR_OFFSET_Y } from './constants';
import type {
  MobileSelectionController,
  MobileSelectionHandleEndpoint,
  MobileSelectionHandlesState,
  MobileSelectionPointerDrag,
} from './runtimeTypes';

type MutableReaderRef<T> = { current: T };

interface MobileSelectionHandlesProps {
  handles: MobileSelectionHandlesState;
  controllerRef: MutableReaderRef<MobileSelectionController | null>;
  pointerDragRef: MutableReaderRef<MobileSelectionPointerDrag | null>;
}

export function MobileSelectionHandles({
  handles,
  controllerRef,
  pointerDragRef,
}: MobileSelectionHandlesProps) {
  const handlePointerDown = (
    endpoint: MobileSelectionHandleEndpoint,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    controllerRef.current?.cancelDrag();
    const rect = event.currentTarget.getBoundingClientRect();
    pointerDragRef.current = {
      pointerId: event.pointerId,
      endpoint,
      grabOffsetX: event.clientX - (rect.left + rect.width / 2),
      grabOffsetY: event.clientY - (rect.top + MOBILE_SELECTION_HANDLE_ANCHOR_OFFSET_Y),
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    controllerRef.current?.startDrag(endpoint);
  };

  const handlePointerMove = (
    endpoint: MobileSelectionHandleEndpoint,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    const drag = pointerDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || drag.endpoint !== endpoint) return;
    event.preventDefault();
    event.stopPropagation();
    controllerRef.current?.moveDrag(
      endpoint,
      event.clientX - drag.grabOffsetX,
      event.clientY - drag.grabOffsetY,
    );
  };

  const handlePointerUp = (
    endpoint: MobileSelectionHandleEndpoint,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    const drag = pointerDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || drag.endpoint !== endpoint) return;
    event.preventDefault();
    event.stopPropagation();
    controllerRef.current?.endDrag(
      endpoint,
      event.clientX - drag.grabOffsetX,
      event.clientY - drag.grabOffsetY,
    );
    pointerDragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handlePointerCancel = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    pointerDragRef.current = null;
    controllerRef.current?.cancelDrag();
  };

  const handleLostPointerCapture = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = pointerDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    pointerDragRef.current = null;
    controllerRef.current?.cancelDrag();
  };

  const renderHandle = (endpoint: MobileSelectionHandleEndpoint) => {
    const position = handles[endpoint];
    if (!position || (handles.dragging && handles.dragging !== endpoint)) return null;
    return (
      <button
        aria-label={endpoint === 'start' ? '拖动选区开头' : '拖动选区结尾'}
        className={`mobile-selection-handle mobile-selection-handle--${endpoint}`}
        style={{ left: position.left, top: position.top }}
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onContextMenu={(event) => event.preventDefault()}
        onLostPointerCapture={handleLostPointerCapture}
        onPointerCancel={handlePointerCancel}
        onPointerDown={(event) => handlePointerDown(endpoint, event)}
        onPointerMove={(event) => handlePointerMove(endpoint, event)}
        onPointerUp={(event) => handlePointerUp(endpoint, event)}
      />
    );
  };

  return (
    <div className="mobile-selection-handles" aria-label="调整文本选区">
      {renderHandle('start')}
      {renderHandle('end')}
    </div>
  );
}
