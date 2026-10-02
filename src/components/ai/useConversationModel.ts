import { useLearningStore } from '../../store/useLearningStore';
import { coerceAiReasoningEffort } from '../../util/ai/aiReasoning';
import type { AiProvider, ChatSession } from '../../../contracts/ai';

export function useConversationModel(currentSession: ChatSession | undefined) {
  const configs = useLearningStore((state) => state.openAIConfigs);
  const aiPreferences = useLearningStore((state) => state.aiPreferences);
  const setAiPreferences = useLearningStore((state) => state.setAiPreferences);
  const updateChatSession = useLearningStore((state) => state.updateChatSession);
  const provider = aiPreferences.provider;
  const selectedConfig = provider
    ? configs.find((config) => provider === `api:${config.id}`)
    : undefined;
  const model = selectedConfig?.models.includes(aiPreferences.model)
    ? aiPreferences.model
    : (selectedConfig?.models[0] ?? '');
  const reasoningEffort = coerceAiReasoningEffort(
    aiPreferences.reasoningEffort,
    selectedConfig,
    model,
  );
  const chooseModel = (selection: unknown) => {
    if (!Array.isArray(selection) || selection.length < 2) return;
    const nextProvider = String(selection[0]) as AiProvider;
    const nextModel = String(selection[1]);
    const nextConfig = configs.find((config) => nextProvider === `api:${config.id}`);
    const nextReasoningEffort = coerceAiReasoningEffort(reasoningEffort, nextConfig, nextModel);
    setAiPreferences({
      provider: nextProvider,
      model: nextModel,
      reasoningEffort: nextReasoningEffort,
    });
    if (currentSession) {
      updateChatSession(currentSession.id, {
        provider: nextProvider,
        model: nextModel,
        reasoningEffort: nextReasoningEffort,
      });
    }
  };
  const chooseReasoningEffort = (nextValue: typeof reasoningEffort) => {
    const nextReasoningEffort = coerceAiReasoningEffort(nextValue, selectedConfig, model);
    setAiPreferences({ reasoningEffort: nextReasoningEffort });
    if (currentSession) {
      updateChatSession(currentSession.id, { reasoningEffort: nextReasoningEffort });
    }
  };
  return {
    configs,
    aiPreferences,
    setAiPreferences,
    provider,
    selectedConfig,
    model,
    reasoningEffort,
    chooseModel,
    chooseReasoningEffort,
  };
}
