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
  const mobileOverlayHistoryActiveRef = useRef<string>();

  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      if (!mobileOverlayHistoryActiveRef.current) return;
      const state = event.state as { learningCenterMobileOverlay?: string | boolean } | null;
      if (state?.learningCenterMobileOverlay === mobileOverlayHistoryActiveRef.current) return;
      mobileOverlayHistoryActiveRef.current = undefined;
      close();
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [close]);

  useEffect(() => {
    if (open && !mobileOverlayHistoryActiveRef.current) {
      const currentState = window.history.state;
      const historyId = crypto.randomUUID();
      window.history.pushState(
        {
          ...(currentState && typeof currentState === 'object' ? currentState : {}),
          learningCenterMobileOverlay: historyId,
        },
        '',
        window.location.href,
      );
      mobileOverlayHistoryActiveRef.current = historyId;
      return;
    }
    if (!open && mobileOverlayHistoryActiveRef.current) {
      mobileOverlayHistoryActiveRef.current = undefined;
      window.history.back();
    }
  }, [open]);

  useEffect(() => {
    if (open) setMobileChromeVisible(true);
  }, [open, setMobileChromeVisible]);
}
