import type {
  AiDialogueContentItem,
  AiReasoningEffort,
  ChatMessage,
  ChatSession,
} from '../../../contracts/ai';
import type { ChapterVideoJob, ChapterVideoNarration } from '../../../contracts/reading';

export interface ChapterVideoJobsResponse {
  jobs: ChapterVideoJob[];
}

type AiJobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface AiJob {
  id: string;
  bookId: string;
  resourceType?: 'book' | 'rss' | 'video' | 'rssDigest';
  termId?: string;
  chapterId?: string;
  rssItemId?: string;
  videoId?: string;
  digestDate?: string;
  purpose?:
    'chat' | 'summary' | 'translation' | 'digest' | 'glossary' | 'mindmap' | 'chapter-video';
  conversationId: string;
  userMessageId: string;
  userMessage?: ChatMessage;
  assistantMessageId: string;
  assistantCreatedAt?: number;
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

export type AiJobSummary = Omit<
  AiJob,
  'content' | 'dialogueContent' | 'translationHtml' | 'userMessage'
>;

export interface StartAiJobInput {
  configId: string;
  model: string;
  reasoningEffort?: Exclude<AiReasoningEffort, 'auto'>;
  bookId: string;
  resourceType?: 'book' | 'rss' | 'video' | 'rssDigest';
  termId?: string;
  chapterId?: string;
  rssItemId?: string;
  videoId?: string;
  digestDate?: string;
  digestItemIds?: string[];
  purpose?:
    'chat' | 'summary' | 'translation' | 'digest' | 'glossary' | 'mindmap' | 'chapter-video';
  videoNarration?: ChapterVideoNarration;
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

export interface DiscoverModelsRequest {
  baseUrl: string;
  apiKey?: string;
}

export interface DiscoverModelsResponse {
  baseUrl: string;
  models: string[];
}
