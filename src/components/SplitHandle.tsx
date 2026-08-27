import type { KeyboardEvent, PointerEvent } from 'react';

interface SplitHandleProps {
  label: string;
  value: number;
  min: number;
  max: number;
  direction?: 1 | -1;
  onChange: (value: number) => void;
}

export function SplitHandle({ label, value, min, max, direction = 1, onChange }: SplitHandleProps) {
  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const startX = event.clientX;
    const startValue = value;
    document.body.classList.add('is-resizing-panels');

    const move = (moveEvent: globalThis.PointerEvent) => {
      const nextValue = startValue + (moveEvent.clientX - startX) * direction;
      onChange(Math.max(min, Math.min(max, nextValue)));
    };
    const finish = () => {
      document.body.classList.remove('is-resizing-panels');
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
    };

    event.preventDefault();
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const delta = event.key === 'ArrowLeft' ? -16 : 16;
    onChange(Math.max(min, Math.min(max, value + delta * direction)));
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
