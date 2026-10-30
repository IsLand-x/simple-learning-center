import { mergeConversationDrafts } from './conversationDrafts';
import { upgradeReaderTypography } from '../../util/reading/readerThemes';
import {
  defaultAiPreferences,
  defaultReaderPreferences,
  defaultWebSearchConfig,
} from '../defaults';
import type { LearningState } from '../learningState';
import {
  normalizeReaderFont,
  normalizeReaderTheme,
  normalizeStoredCustomStyle,
} from '../normalizers';
import { normalizeHiddenReaderAiPromptTemplateIds } from '../../util/ai/readerAiPrompts';
import { normalizeAiReasoningEffort } from '../../util/ai/aiReasoning';
import { mergeReadingNotes } from './noteStateMerge';
import { mergeReaderHighlights, mergeReaderPreferences } from './readerStateMerge';

export function mergeLearningState(
  persistedState: unknown,
  currentState: LearningState,
): LearningState {
  const persisted = persistedState as Partial<LearningState>;
  const mergedHighlights = mergeReaderHighlights(persisted, currentState);
  const mergedPreferences = mergeReaderPreferences(persisted, currentState);
  const localChats = new Map(currentState.chats.map((message) => [message.id, message]));
  return {
    ...currentState,
    ...persisted,
    chapterVideos: Array.isArray(persisted.chapterVideos)
      ? persisted.chapterVideos
      : currentState.chapterVideos,
    chapterMindMaps: Array.isArray(persisted.chapterMindMaps)
      ? persisted.chapterMindMaps
      : currentState.chapterMindMaps,
    conversationDrafts: mergeConversationDrafts(
      currentState.conversationDrafts,
      persisted.conversationDrafts ?? [],
    ),
    ...mergeReadingNotes(persisted, currentState),
    chats: (persisted.chats ?? currentState.chats).map((message) => {
      const local = localChats.get(message.id);
      const readAt = Math.max(message.readAt ?? 0, local?.readAt ?? 0);
      return readAt ? { ...message, readAt } : message;
    }),
    bookLists: Array.isArray(persisted.bookLists) ? persisted.bookLists : currentState.bookLists,
    trashedBooks: Array.isArray(persisted.trashedBooks)
      ? persisted.trashedBooks
      : currentState.trashedBooks,
    deletedBookTombstones: Array.isArray(persisted.deletedBookTombstones)
      ? persisted.deletedBookTombstones
      : currentState.deletedBookTombstones,
    deletedHighlightTombstones: mergedHighlights.deletedHighlightTombstones,
    highlights: mergedHighlights.highlights,
    // 已停用功能的历史字段由上面的快照展开原样保留，不补默认值或重新规范化。
    readerPreferences: upgradeReaderTypography({
      ...defaultReaderPreferences,
      ...mergedPreferences.readerPreferences,
      theme: normalizeReaderTheme(mergedPreferences.readerPreferences.theme),
      fontFamily: normalizeReaderFont(mergedPreferences.readerPreferences.fontFamily),
      customStyle: normalizeStoredCustomStyle(mergedPreferences.readerPreferences.customStyle),
    }),
    readerPreferencesUpdatedAt: mergedPreferences.readerPreferencesUpdatedAt,
    readerStyleUpdatedAt: mergedPreferences.readerStyleUpdatedAt,
    readerLayoutUpdatedAt: mergedPreferences.readerLayoutUpdatedAt,
    aiPreferences: {
      provider: persisted.aiPreferences
        ? persisted.aiPreferences.provider?.startsWith('api:')
          ? persisted.aiPreferences.provider
          : null
        : currentState.aiPreferences.provider,
      model: persisted.aiPreferences?.model ?? currentState.aiPreferences.model,
      reasoningEffort: persisted.aiPreferences
        ? normalizeAiReasoningEffort(persisted.aiPreferences.reasoningEffort)
        : normalizeAiReasoningEffort(currentState.aiPreferences.reasoningEffort),
      assistantPrompt:
        typeof persisted.aiPreferences?.assistantPrompt === 'string'
          ? persisted.aiPreferences.assistantPrompt
          : (currentState.aiPreferences.assistantPrompt ?? defaultAiPreferences.assistantPrompt),
      autoHideReasoning:
        typeof persisted.aiPreferences?.autoHideReasoning === 'boolean'
          ? persisted.aiPreferences.autoHideReasoning
          : (currentState.aiPreferences.autoHideReasoning ??
            defaultAiPreferences.autoHideReasoning),
      hiddenPromptTemplateIds: persisted.aiPreferences
        ? normalizeHiddenReaderAiPromptTemplateIds(persisted.aiPreferences.hiddenPromptTemplateIds)
        : normalizeHiddenReaderAiPromptTemplateIds(
            currentState.aiPreferences.hiddenPromptTemplateIds,
          ),
    },
    webSearchConfig: {
      ...defaultWebSearchConfig,
      ...currentState.webSearchConfig,
      ...(persisted.webSearchConfig ?? {}),
    },
  };
}
