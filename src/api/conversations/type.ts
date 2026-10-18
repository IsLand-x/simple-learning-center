import type {
  ConversationMessagesPage,
  ConversationPage,
  ChatSession,
} from '../../../contracts/ai';

export type { ConversationMessagesPage, ConversationPage };
export type ConversationChanges = Partial<
  Pick<ChatSession, 'provider' | 'model' | 'reasoningEffort'>
>;
