import type { KeyboardEvent, PointerEvent } from 'react';

interface SplitHandleProps {
  label: string;
  onDelta: (delta: number) => void;
}

export function SplitHandle({ label, onDelta }: SplitHandleProps) {
  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const startX = event.clientX;
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    let previousX = startX;

    const move = (moveEvent: globalThis.PointerEvent) => {
      const delta = moveEvent.clientX - previousX;
      previousX = moveEvent.clientX;
      onDelta(delta);
    };
    const finish = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', finish);
      target.removeEventListener('pointercancel', finish);
    };

    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', finish);
    target.addEventListener('pointercancel', finish);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    onDelta(event.key === 'ArrowLeft' ? -16 : 16);
  };

  return (
    <div
      className="split-handle"
      role="separator"
      aria-label={label}
      aria-orientation="vertical"
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onKeyDown={handleKeyDown}
    >
      <span />
    </div>
  );
}
