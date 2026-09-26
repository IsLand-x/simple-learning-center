import type { AiDialogueContentItem, AiReasoningEffort, ChatSession } from '../../../contracts/ai';

type AiJobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface AiJob {
  id: string;
  bookId: string;
  resourceType?: 'book' | 'rss' | 'video' | 'rssDigest';
  rssItemId?: string;
  videoId?: string;
  digestDate?: string;
  purpose?: 'chat' | 'summary' | 'translation' | 'digest';
  conversationId: string;
  userMessageId: string;
  assistantMessageId: string;
  status: AiJobStatus;
  revision: number;
  content: string;
  translationHtml?: string;
  dialogueContent: AiDialogueContentItem[];
  notesRevision?: number;
  error?: string;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
}

export interface StartAiJobInput {
  configId: string;
  model: string;
  reasoningEffort?: Exclude<AiReasoningEffort, 'auto'>;
  bookId: string;
  resourceType?: 'book' | 'rss' | 'video' | 'rssDigest';
  rssItemId?: string;
  videoId?: string;
  digestDate?: string;
  digestItemIds?: string[];
  purpose?: 'chat' | 'summary' | 'translation' | 'digest';
  conversationId: string;
  userMessage: {
    id: string;
    content: string;
    quote?: { text: string; chapter: string };
    createdAt: number;
  };
  session: Pick<ChatSession, 'title' | 'createdAt'>;
  currentText: string;
}

export interface AiJobsResponse {
  jobs?: AiJob[];
}

export interface ListAiJobsRequest {
  bookId: string;
  conversationId?: string;
}

export type AiJobListener = (job: AiJob) => void;
export type AiJobEventStream = ReadableStream<Uint8Array>;
