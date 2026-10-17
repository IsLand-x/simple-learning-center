import { useEffect, useRef } from 'react';
import type { Select } from '@douyinfe/semi-ui';

const historyKey = 'learningCenterAnnotationSort';

export function useAnnotationSortHistory(mobile: boolean, panel: string | null) {
  const selectRef = useRef<Select>(null);
  const historyIdRef = useRef<string | null>(null);

  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      if (!historyIdRef.current || event.state?.[historyKey] === historyIdRef.current) return;
      historyIdRef.current = null;
      selectRef.current?.close();
    };
    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      const id = historyIdRef.current;
      historyIdRef.current = null;
      if (id && window.history.state?.[historyKey] === id) window.history.back();
    };
  }, [panel]);

  const onDropdownVisibleChange = (visible: boolean) => {
    if (!mobile) return;
    if (visible && !historyIdRef.current) {
      const id = crypto.randomUUID();
      historyIdRef.current = id;
      window.history.pushState(
        { ...window.history.state, [historyKey]: id },
        '',
        window.location.href,
      );
    } else if (!visible && historyIdRef.current) {
      const id = historyIdRef.current;
      historyIdRef.current = null;
      if (window.history.state?.[historyKey] === id) window.history.back();
    }
  };
  return { selectRef, onDropdownVisibleChange };
}
