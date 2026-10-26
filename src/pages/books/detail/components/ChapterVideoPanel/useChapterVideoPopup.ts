import type { Select } from '@douyinfe/semi-ui';
import { useEffect, useRef, useState } from 'react';

const historyKey = 'learningCenterChapterVideoPopup';
type Popup = 'speed' | 'actions';

export function useChapterVideoPopup(mobile: boolean, videoId: string) {
  const speedRef = useRef<Select>(null);
  const [actionsVisible, setActionsVisible] = useState(false);
  const historyId = useRef<string>();
  const current = useRef<Popup>();
  const closing = useRef(0);

  useEffect(() => {
    speedRef.current?.close();
    setActionsVisible(false);
    const onPopState = (event: PopStateEvent) => {
      if (!historyId.current || event.state?.[historyKey] === historyId.current) return;
      window.clearTimeout(closing.current);
      historyId.current = undefined;
      current.current = undefined;
      speedRef.current?.close();
      setActionsVisible(false);
    };
    window.addEventListener('popstate', onPopState);
    return () => {
      window.clearTimeout(closing.current);
      window.removeEventListener('popstate', onPopState);
      const id = historyId.current;
      historyId.current = undefined;
      current.current = undefined;
      if (id && window.history.state?.[historyKey] === id) window.history.back();
    };
  }, [mobile, videoId]);

  const change = (popup: Popup, visible: boolean) => {
    if (popup === 'actions') setActionsVisible(visible);
    if (visible) {
      window.clearTimeout(closing.current);
      current.current = popup;
      if (popup === 'speed') setActionsVisible(false);
      else speedRef.current?.close();
      if (mobile && !historyId.current) {
        const id = crypto.randomUUID();
        historyId.current = id;
        window.history.pushState(
          { ...window.history.state, [historyKey]: id },
          '',
          window.location.href,
        );
      }
    } else if (current.current === popup) {
      // Share one temporary history layer when switching between the two menus.
      window.clearTimeout(closing.current);
      closing.current = window.setTimeout(() => {
        const id = historyId.current;
        historyId.current = undefined;
        current.current = undefined;
        if (id && window.history.state?.[historyKey] === id) window.history.back();
      }, 0);
    }
  };
  return { speedRef, actionsVisible, change };
}
