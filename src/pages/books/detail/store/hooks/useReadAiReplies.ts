import { useEffect, type RefObject } from 'react';
import { useLearningStore } from '../../../../../util/state/useLearningStore';
import type { ChatMessage } from '../../../../../util/types';

export function useReadAiReplies(areaRef: RefObject<HTMLDivElement>, chats: ChatMessage[]) {
  const markRead = useLearningStore((state) => state.markChatMessagesRead);
  useEffect(() => {
    const unreadIds = chats
      .filter((message) => message.role === 'assistant' && !message.readAt)
      .map((message) => message.id);
    if (!unreadIds.length) return;
    const list = areaRef.current?.querySelector<HTMLElement>('.semi-ai-chat-dialogue-list');
    if (!list) return;
    const check = () => {
      if (document.visibilityState !== 'visible' || !list.checkVisibility() || !list.clientHeight)
        return;
      if (list.scrollHeight - list.scrollTop - list.clientHeight <= 32) markRead(unreadIds);
    };
    const frame = requestAnimationFrame(check);
    const observer = new ResizeObserver(check);
    observer.observe(list);
    list.addEventListener('scroll', check, { passive: true });
    document.addEventListener('visibilitychange', check);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      list.removeEventListener('scroll', check);
      document.removeEventListener('visibilitychange', check);
    };
  }, [areaRef, chats, markRead]);
}
