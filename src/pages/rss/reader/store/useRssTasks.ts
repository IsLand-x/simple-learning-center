import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { useEffect } from 'react';
import { synchronizeLearningState } from '../../../../store/learningStateSync';
import { useLearningStore } from '../../../../store/useLearningStore';
import { useRssAutoSummary } from './useRssAutoSummary';
import { useRssDigestTask } from './useRssDigestTask';
import { useRssTranslation } from './useRssTranslation';
import type { WorkspaceContextValue } from './workspaceTypes';
type RssTasksInput = Pick<
  WorkspaceContextValue['navigation'],
  'isSelectedVideo' | 'selectedItem' | 'hasSelectedTranslation' | 'selectedDigest' | 'todayKey'
> & {
  selectedItemId: string | null;
  selectedItemIdRef: MutableRefObject<string | null>;
  setTranslationVisible: Dispatch<SetStateAction<boolean>>;
};
export function useRssTasks({
  isSelectedVideo,
  selectedItem,
  hasSelectedTranslation,
  selectedDigest,
  todayKey,
  selectedItemId,
  selectedItemIdRef,
  setTranslationVisible,
}: RssTasksInput) {
  const aiPreferences = useLearningStore((state) => state.aiPreferences);
  const configs = useLearningStore((state) => state.openAIConfigs);
  const updateRssItem = useLearningStore((state) => state.updateRssItem);
  useEffect(() => {
    let disposed = false;
    let syncing = false;
    const syncScheduledContent = async () => {
      if (disposed || syncing || document.visibilityState === 'hidden') return;
      syncing = true;
      try {
        if (!disposed) await synchronizeLearningState();
      } catch (error) {
        console.warn('无法同步服务端 RSS 更新', error);
      } finally {
        syncing = false;
      }
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void syncScheduledContent();
    };
    const timer = window.setInterval(() => void syncScheduledContent(), 60_000);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  const { summaryError, summaryStatus } = useRssAutoSummary({
    aiPreferences,
    configs,
    isSelectedVideo,
    selectedItem,
    updateRssItem,
  });

  const { translateCurrentPage, translationTasks } = useRssTranslation({
    aiPreferences,
    configs,
    selectedItem,
    selectedItemIdRef,
    setTranslationVisible,
    updateRssItem,
  });
  const selectedTranslationTask = selectedItemId ? translationTasks[selectedItemId] : undefined;
  const translationStatus =
    selectedTranslationTask?.status ?? (hasSelectedTranslation ? 'ready' : 'idle');
  const translationError = selectedTranslationTask?.error ?? '';

  const { digestError, digestGenerating, runDigest } = useRssDigestTask({
    selectedDigestDate: selectedDigest?.date,
    todayKey,
  });

  return {
    summaryError,
    summaryStatus,
    translateCurrentPage,
    translationStatus,
    translationError,
    digestError,
    digestGenerating,
    runDigest,
  };
}
