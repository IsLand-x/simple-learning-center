import { useEffect } from 'react';

export function useReaderJobPolling(
  refresh: (signal: AbortSignal) => Promise<void>,
  active: boolean,
) {
  useEffect(() => {
    let disposed = false;
    let timer = 0;
    let request: AbortController | undefined;
    let failures = 0;
    let lastStarted = -Infinity;
    const interval = active ? 5_000 : 30_000;
    const canRefresh = () => document.visibilityState === 'visible' && navigator.onLine;
    const poll = async () => {
      if (disposed || request || !canRefresh()) return;
      window.clearTimeout(timer);
      const controller = new AbortController();
      request = controller;
      lastStarted = Date.now();
      try {
        await refresh(controller.signal);
        failures = 0;
      } catch {
        if (!controller.signal.aborted) failures += 1;
      } finally {
        request = undefined;
        if (!disposed && canRefresh())
          timer = window.setTimeout(poll, Math.min(60_000, interval * 2 ** failures));
      }
    };
    const resume = () => {
      window.clearTimeout(timer);
      if (!canRefresh()) {
        request?.abort();
        return;
      }
      // Focus and visibilitychange often arrive together when returning to the app.
      const delay = Math.max(0, 1_000 - (Date.now() - lastStarted));
      if (delay) timer = window.setTimeout(poll, delay);
      else void poll();
    };
    void poll();
    window.addEventListener('focus', resume);
    window.addEventListener('online', resume);
    window.addEventListener('offline', resume);
    document.addEventListener('visibilitychange', resume);
    return () => {
      disposed = true;
      request?.abort();
      window.clearTimeout(timer);
      window.removeEventListener('focus', resume);
      window.removeEventListener('online', resume);
      window.removeEventListener('offline', resume);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [active, refresh]);
}
