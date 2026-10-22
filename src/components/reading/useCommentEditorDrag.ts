import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import type { ReaderSelection } from '../../types/reader';
import { clamp } from '../../util/format';
import type { VisualViewportBounds } from './useOverlayViewport';

export function useCommentEditorDrag(
  viewport: VisualViewportBounds,
  target: ReaderSelection['rect'],
) {
  const formRef = useRef<HTMLFormElement>(null);
  const moved = useRef(false);
  const currentPosition = useRef({ left: 0, top: 0 });
  const drag = useRef<{
    pointerId: number;
    x: number;
    y: number;
    left: number;
    top: number;
  } | null>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const { width, height, offsetLeft, offsetTop } = viewport;
  const { left, top, width: targetWidth, height: targetHeight } = target;

  const moveTo = useCallback(
    (nextLeft: number, nextTop: number) => {
      const rect = formRef.current?.getBoundingClientRect();
      if (!rect) return;
      const minimumLeft = offsetLeft + 8;
      const minimumTop = offsetTop + 8;
      const next = {
        left: clamp(
          nextLeft,
          minimumLeft,
          Math.max(minimumLeft, offsetLeft + width - rect.width - 8),
        ),
        top: clamp(nextTop, minimumTop, Math.max(minimumTop, offsetTop + height - rect.height - 8)),
      };
      currentPosition.current = next;
      setPosition((previous) =>
        previous?.left === next.left && previous.top === next.top ? previous : next,
      );
    },
    [width, height, offsetLeft, offsetTop],
  );

  useLayoutEffect(() => {
    const form = formRef.current;
    if (!form) return;
    const place = () => {
      const rect = form.getBoundingClientRect();
      const keyboardVisible = height < window.innerHeight - 120;
      const initialLeft = keyboardVisible
        ? offsetLeft + (width - rect.width) / 2
        : left + (targetWidth - rect.width) / 2;
      const initialTop = keyboardVisible
        ? offsetTop + height - rect.height - 8
        : top < 210
          ? top + targetHeight + 8
          : top - rect.height - 8;
      moveTo(
        moved.current ? currentPosition.current.left : initialLeft,
        moved.current ? currentPosition.current.top : initialTop,
      );
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(form);
    return () => observer.disconnect();
  }, [width, height, offsetLeft, offsetTop, left, top, targetWidth, targetHeight, moveTo]);

  const endDrag = (event: PointerEvent<HTMLElement>) => {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return {
    formRef,
    position,
    dragging,
    handleProps: {
      onClick: () => formRef.current?.querySelector('textarea')?.focus(),
      onPointerDown: (event: PointerEvent<HTMLElement>) => {
        if (!event.isPrimary || event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        const rect = formRef.current?.getBoundingClientRect();
        if (!rect) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = {
          pointerId: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          left: rect.left,
          top: rect.top,
        };
        setDragging(true);
      },
      onPointerMove: (event: PointerEvent<HTMLElement>) => {
        const start = drag.current;
        if (!start || start.pointerId !== event.pointerId) return;
        event.preventDefault();
        moved.current = true;
        moveTo(start.left + event.clientX - start.x, start.top + event.clientY - start.y);
      },
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
      onLostPointerCapture: () => {
        drag.current = null;
        setDragging(false);
      },
      onKeyUp: (event: KeyboardEvent<HTMLElement>) => {
        if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
          event.preventDefault();
          event.stopPropagation();
        }
      },
      onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          event.stopPropagation();
          formRef.current?.querySelector('textarea')?.focus();
          return;
        }
        const directions: { [key: string]: [number, number] | undefined } = {
          ArrowLeft: [-1, 0],
          ArrowRight: [1, 0],
          ArrowUp: [0, -1],
          ArrowDown: [0, 1],
        };
        const direction = directions[event.key];
        if (!direction) return;
        event.preventDefault();
        event.stopPropagation();
        moved.current = true;
        const step = event.shiftKey ? 40 : 10;
        moveTo(
          currentPosition.current.left + direction[0] * step,
          currentPosition.current.top + direction[1] * step,
        );
      },
    },
  };
}
