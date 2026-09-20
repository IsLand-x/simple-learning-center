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
    const handlePopState = (event: PopStateEvent) => {
      if (!mobileOverlayHistoryActiveRef.current) return;
      const state = event.state as { learningCenterMobileOverlay?: boolean } | null;
      if (state?.learningCenterMobileOverlay) return;
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
}
