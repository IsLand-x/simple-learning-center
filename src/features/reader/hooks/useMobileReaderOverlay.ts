import { useEffect, useRef, type Dispatch, type SetStateAction } from 'react';

export function useMobileReaderOverlay({
  close,
  open,
  setMobileChromeVisible,
}: {
  close: () => void;
  open: boolean;
  setMobileChromeVisible: Dispatch<SetStateAction<boolean>>;
}) {
  const mobileOverlayHistoryActiveRef = useRef(false);

  useEffect(() => {
    const handlePopState = () => {
      if (!mobileOverlayHistoryActiveRef.current) return;
      mobileOverlayHistoryActiveRef.current = false;
      close();
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [close]);

  useEffect(() => {
    if (open && !mobileOverlayHistoryActiveRef.current) {
      const currentState = window.history.state;
      window.history.pushState(
        {
          ...(currentState && typeof currentState === 'object' ? currentState : {}),
          learningCenterMobileOverlay: true,
        },
        '',
        window.location.href,
      );
      mobileOverlayHistoryActiveRef.current = true;
      return;
    }
    if (!open && mobileOverlayHistoryActiveRef.current) {
      mobileOverlayHistoryActiveRef.current = false;
      window.history.back();
    }
  }, [open]);

  useEffect(() => {
    if (open) setMobileChromeVisible(true);
  }, [open, setMobileChromeVisible]);

  useEffect(() => {
    if (!open) return undefined;
    let touchStart: { x: number; y: number } | null = null;
    const handleTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) {
        touchStart = null;
        return;
      }
      touchStart = {
        x: event.touches[0].clientX,
        y: event.touches[0].clientY,
      };
    };
    const handleTouchEnd = (event: TouchEvent) => {
      if (!touchStart || event.changedTouches.length !== 1) {
        touchStart = null;
        return;
      }
      const deltaX = event.changedTouches[0].clientX - touchStart.x;
      const deltaY = event.changedTouches[0].clientY - touchStart.y;
      touchStart = null;
      if (Math.abs(deltaX) >= 64 && Math.abs(deltaX) > Math.abs(deltaY) * 1.25) {
        close();
      }
    };
    const resetTouch = () => {
      touchStart = null;
    };
    document.addEventListener('touchstart', handleTouchStart, { capture: true, passive: true });
    document.addEventListener('touchend', handleTouchEnd, { capture: true, passive: true });
    document.addEventListener('touchcancel', resetTouch, { capture: true, passive: true });
    return () => {
      document.removeEventListener('touchstart', handleTouchStart, true);
      document.removeEventListener('touchend', handleTouchEnd, true);
      document.removeEventListener('touchcancel', resetTouch, true);
    };
  }, [close, open]);
}
