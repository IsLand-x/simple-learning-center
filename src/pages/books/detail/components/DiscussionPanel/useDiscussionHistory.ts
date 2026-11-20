import { useEffect, useRef } from 'react';

const historyKey = 'learningCenterDiscussionDetail';

export function useDiscussionHistory({
  mobile,
  active,
  onClose,
}: {
  mobile: boolean;
  active: boolean;
  onClose: () => void;
}) {
  const historyIdRef = useRef<string | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!mobile) return;
    const handlePopState = (event: PopStateEvent) => {
      if (!historyIdRef.current) return;
      const state = event.state as Record<string, unknown> | null;
      if (state?.[historyKey] === historyIdRef.current) return;
      historyIdRef.current = null;
      closeRef.current();
    };
    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      const id = historyIdRef.current;
      historyIdRef.current = null;
      if (id && (window.history.state as Record<string, unknown> | null)?.[historyKey] === id) {
        window.history.back();
      }
    };
  }, [mobile]);

  useEffect(() => {
    if (!mobile) return;
    if (active && !historyIdRef.current) {
      const id = crypto.randomUUID();
      historyIdRef.current = id;
      const currentState = window.history.state;
      window.history.pushState(
        {
          ...(currentState && typeof currentState === 'object' ? currentState : {}),
          [historyKey]: id,
        },
        '',
        window.location.href,
      );
      return;
    }
    if (!active && historyIdRef.current) {
      const id = historyIdRef.current;
      historyIdRef.current = null;
      if ((window.history.state as Record<string, unknown> | null)?.[historyKey] === id) {
        window.history.back();
      }
    }
  }, [active, mobile]);
}
