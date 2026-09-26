import { useState, useEffect } from 'react';
export interface VisualViewportBounds {
  height: number;
  offsetLeft: number;
  offsetTop: number;
  width: number;
}

function readVisualViewport(): VisualViewportBounds {
  const viewport = window.visualViewport;
  return {
    height: viewport?.height ?? window.innerHeight,
    offsetLeft: viewport?.offsetLeft ?? 0,
    offsetTop: viewport?.offsetTop ?? 0,
    width: viewport?.width ?? window.innerWidth,
  };
}

export function useOverlayViewport() {
  const [visualViewport, setVisualViewport] = useState(readVisualViewport);

  useEffect(() => {
    const viewport = window.visualViewport;
    const syncViewport = () => setVisualViewport(readVisualViewport());
    window.addEventListener('resize', syncViewport);
    viewport?.addEventListener('resize', syncViewport);
    viewport?.addEventListener('scroll', syncViewport);
    return () => {
      window.removeEventListener('resize', syncViewport);
      viewport?.removeEventListener('resize', syncViewport);
      viewport?.removeEventListener('scroll', syncViewport);
    };
  }, []);

  return visualViewport;
}
