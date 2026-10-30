import type { ChatMessage } from '../../../../contracts/ai.js';
import type { AiChatContext } from './types.js';
import type { NormalizedJobInput } from './startInput.js';
import type { PreparedJobResources } from './startResources.js';
import { normalizedMessage, optionalString } from './model.js';

export function createJobContext(
  input: NormalizedJobInput,
  resources: PreparedJobResources,
  userMessage: ChatMessage,
): AiChatContext {
  const { model, reasoningEffort, conversationId, purpose, currentText, bookId } = input;
  const { config, existingChats, book, state, videoNarration } = resources;
  return {
    config: structuredClone(config),
    model,
    reasoningEffort,
    conversationId,
    messages: [...existingChats, normalizedMessage(userMessage)],
    resourceType: 'book',
    purpose,
    book: structuredClone(book),
    currentText,
    notes: (Array.isArray(state.notes) ? state.notes : [])
      .filter((note) => note.bookId === bookId)
      .map((note) => structuredClone(note)),
    highlights: (Array.isArray(state.highlights) ? state.highlights : [])
      .filter((highlight) => highlight.bookId === bookId)
      .map((highlight) => structuredClone(highlight)),
    readingSessions: (Array.isArray(state.readingSessions) ? state.readingSessions : [])
      .filter((readingSession) => readingSession.bookId === bookId)
      .sort((left, right) => right.startedAt - left.startedAt)
      .map((readingSession) => structuredClone(readingSession)),
    webSearchConfig: structuredClone(state.webSearchConfig ?? { provider: 'jina', apiKey: '' }),
    assistantPrompt: optionalString(state.aiPreferences?.assistantPrompt, 4_000).trim(),
    ...(videoNarration ? { videoNarration } : {}),
  };
}
