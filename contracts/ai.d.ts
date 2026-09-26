export type AiProvider = `api:${string}`;

export interface ChatMessage {
  id: string;
  bookId: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  dialogueContent?: AiDialogueContentItem[];
  readAt?: number;
  quote?: {
    text: string;
    chapter: string;
  };
  createdAt: number;
}

export interface AiDialogueContentItem {
  type?: string;
  status?: string;
  [key: string]: unknown;
}

export interface ChatSession {
  id: string;
  bookId: string;
  title: string;
  provider?: AiProvider;
  model?: string;
  reasoningEffort?: AiReasoningEffort;
  createdAt: number;
  updatedAt: number;
}

export interface OpenAICompatibleConfig {
  oauthProvider?: 'openai-codex' | 'kimi-coding';
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  models: string[];
  createdAt: number;
  updatedAt: number;
}

export type AiReasoningEffort = 'auto' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface AiPreferences {
  provider: AiProvider | null;
  model: string;
  reasoningEffort: AiReasoningEffort;
  assistantPrompt: string;
  autoHideReasoning: boolean;
  hiddenPromptTemplateIds: string[];
}
