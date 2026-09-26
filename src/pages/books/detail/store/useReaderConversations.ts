import { useEffect, useState } from 'react';
import { useLearningStore } from '../../../../store/useLearningStore';
import type { ChatMessage, ChatSession } from '../../../../../contracts/ai';
import { coerceAiReasoningEffort } from '../../../../util/ai/aiReasoning';
import { createUuid } from '../../../../util/uuid';
import { useReaderAiActivity } from '../components/AssistantPanel/useReaderAiActivity';
import type { MobileReaderPanel } from '../components/ReaderPanel/model';

export function useReaderConversations(
  bookId: string | undefined,
  changeActivePanel: (panel: MobileReaderPanel | null) => void,
) {
  const aiActivity = useReaderAiActivity();
  const openAIConfigs = useLearningStore((state) => state.openAIConfigs);
  const aiPreferences = useLearningStore((state) => state.aiPreferences);
  const setAiPreferences = useLearningStore((state) => state.setAiPreferences);
  const [conversationId, setConversationId] = useState<string>(() => createUuid());
  const [panelQuote, setPanelQuote] = useState<NonNullable<ChatMessage['quote']> | null>(null);
  useEffect(() => {
    if (!bookId) return;
    setConversationId(createUuid());
    setPanelQuote(null);
  }, [bookId]);
  const startNewConversation = () => {
    setConversationId(createUuid());
    setPanelQuote(null);
    changeActivePanel('ai');
  };

  const resumeConversation = (session: ChatSession) => {
    const config = session.provider
      ? openAIConfigs.find((item) => session.provider === `api:${item.id}`)
      : undefined;
    if (session.provider && config) {
      const model =
        session.model && config.models.includes(session.model)
          ? session.model
          : (config.models[0] ?? '');
      const reasoningEffort = coerceAiReasoningEffort(
        session.reasoningEffort ?? aiPreferences.reasoningEffort,
        config,
        model,
      );
      setAiPreferences({ provider: session.provider, model, reasoningEffort });
    }
    setConversationId(session.id);
    setPanelQuote(null);
    changeActivePanel('ai');
  };

  function openActivityPanel(panel: MobileReaderPanel | null) {
    if (
      panel === 'ai' &&
      aiActivity.conversationId &&
      aiActivity.conversationId !== conversationId
    ) {
      const session = useLearningStore
        .getState()
        .chatSessions.find((item) => item.id === aiActivity.conversationId);
      if (session) {
        resumeConversation(session);
        return;
      }
    }
    changeActivePanel(panel);
  }
  return {
    conversationId,
    panelQuote,
    setPanelQuote,
    startNewConversation,
    resumeConversation,
    openActivityPanel,
  };
}
