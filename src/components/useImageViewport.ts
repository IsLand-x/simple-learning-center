import { useCallback, useEffect, useRef, useState } from 'react';

interface Point {
  x: number;
  y: number;
}
interface View extends Point {
  scale: number;
}
const initialView: View = { x: 0, y: 0, scale: 1 };
const clamp = (value: number, limit: number) => Math.max(-limit, Math.min(limit, value));

export function useImageViewport(loaded: boolean) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const current = useRef(initialView);
  const [view, setView] = useState(initialView);

  const update = useCallback((next: View) => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image) return;
    const scale = Math.max(0.5, Math.min(6, next.scale));
    const x = clamp(next.x, Math.max(0, (image.offsetWidth * scale - canvas.clientWidth) / 2));
    const y = clamp(next.y, Math.max(0, (image.offsetHeight * scale - canvas.clientHeight) / 2));
    current.current = { scale, x, y };
    setView(current.current);
  }, []);

  const zoomAt = useCallback(
    (scale: number, from: Point, to = from) => {
      const previous = current.current;
      const nextScale = Math.max(0.5, Math.min(6, scale));
      const ratio = nextScale / previous.scale;
      update({
        scale: nextScale,
        x: to.x - (from.x - previous.x) * ratio,
        y: to.y - (from.y - previous.y) * ratio,
      });
    },
    [update],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !loaded) return;
    const pointers = new Map<number, Point>();
    const local = (x: number, y: number) => {
      const rect = canvas.getBoundingClientRect();
      return { x: x - rect.left - rect.width / 2, y: y - rect.top - rect.height / 2 };
    };
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      event.stopPropagation();
      const delta =
        event.deltaY *
        (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? canvas.clientHeight : 1);
      zoomAt(
        current.current.scale * Math.exp(-clamp(delta, 200) * 0.005),
        local(event.clientX, event.clientY),
      );
    };
    const down = (event: PointerEvent) => {
      if (event.button !== 0 || pointers.size >= 2) return;
      event.preventDefault();
      pointers.set(event.pointerId, local(event.clientX, event.clientY));
      canvas.setPointerCapture(event.pointerId);
    };
    const move = (event: PointerEvent) => {
      const before = pointers.get(event.pointerId);
      if (!before) return;
      const after = local(event.clientX, event.clientY);
      const other = [...pointers.entries()].find(([id]) => id !== event.pointerId)?.[1];
      pointers.set(event.pointerId, after);
      if (other) {
        const distance = Math.hypot(before.x - other.x, before.y - other.y);
        const nextDistance = Math.hypot(after.x - other.x, after.y - other.y);
        if (distance > 0)
          zoomAt(
            (current.current.scale * nextDistance) / distance,
            { x: (before.x + other.x) / 2, y: (before.y + other.y) / 2 },
            { x: (after.x + other.x) / 2, y: (after.y + other.y) / 2 },
          );
      } else {
        update({
          ...current.current,
          x: current.current.x + after.x - before.x,
          y: current.current.y + after.y - before.y,
        });
      }
    };
    const end = (event: PointerEvent) => pointers.delete(event.pointerId);
    const resize = new ResizeObserver(() => {
      pointers.clear();
      update(current.current);
    });
    resize.observe(canvas);
    canvas.addEventListener('wheel', wheel, { passive: false });
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('lostpointercapture', end);
    return () => {
      resize.disconnect();
      canvas.removeEventListener('wheel', wheel);
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', end);
      canvas.removeEventListener('pointercancel', end);
      canvas.removeEventListener('lostpointercapture', end);
    };
  }, [loaded, update, zoomAt]);

  return {
    canvasRef,
    imageRef,
    view,
    reset: () => update(initialView),
    zoom: (delta: number) => {
      if (loaded) zoomAt(current.current.scale + delta, { x: 0, y: 0 });
    },
  };
}
