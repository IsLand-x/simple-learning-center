import type { Dispatch, SetStateAction } from 'react';
import type { MobileReaderPanel } from '../components/ReaderRightSidebar';
import { coerceAiReasoningEffort } from '../../../../util/ai/aiReasoning';
import { createUuid } from '../../../../util/uuid';
import { useLearningStore } from '../../../../util/state/useLearningStore';
import type { LearningState } from '../../../../util/state/learningState';
import type { ChatMessage, ChatSession } from '../../../../util/types';

type ReaderConversationActionOptions = Pick<
  LearningState,
  'openAIConfigs' | 'aiPreferences' | 'setAiPreferences'
> & {
  conversationId: string;
  aiActivity: { conversationId?: string };
  setConversationId: Dispatch<SetStateAction<string>>;
  setPanelQuote: Dispatch<SetStateAction<NonNullable<ChatMessage['quote']> | null>>;
  changeActivePanel: (panel: MobileReaderPanel | null) => void;
};

export function createReaderConversationActions({
  conversationId,
  openAIConfigs,
  aiPreferences,
  aiActivity,
  setConversationId,
  setPanelQuote,
  setAiPreferences,
  changeActivePanel,
}: ReaderConversationActionOptions) {
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
  return { startNewConversation, resumeConversation, openActivityPanel };
}
