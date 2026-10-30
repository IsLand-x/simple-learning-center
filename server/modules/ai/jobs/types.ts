import type {
  AiDialogueContentItem,
  AiReasoningEffort,
  ChatMessage,
  ChatSession,
  OpenAICompatibleConfig,
} from '../../../../contracts/ai.js';
import type { ChapterMindMap, ChapterVideo } from '../../../../contracts/reading.js';
import type { VideoNarrationContext } from '../chapterVideos/media.js';
import type { BookItem } from '../../../../contracts/books.js';
import type { HighlightItem, NoteItem, ReadingSession } from '../../../../contracts/reading.js';
import type { WebSearchConfig } from '../../../../contracts/settings.js';

export type ReasoningEffort = Exclude<AiReasoningEffort, 'auto'>;
export type JobPurpose = 'chat' | 'glossary' | 'mindmap' | 'chapter-video';
export type VideoGenerationPhase = 'evidence' | 'plan' | 'script' | 'review';
type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface AiResult {
  content: string;
  dialogueContent: AiDialogueContentItem[];
  mindMap?: ChapterMindMap;
  chapterVideo?: ChapterVideo;
}

export interface AiJob {
  id: string;
  bookId: string;
  resourceType: 'book';
  purpose: JobPurpose;
  termId?: string;
  chapterId?: string;
  chapterTitle?: string;
  termUpdatedAt?: number;
  model: string;
  reasoningEffort?: ReasoningEffort;
  conversationId: string;
  userMessageId: string;
  assistantMessageId: string;
  assistantCreatedAt: number;
  status: JobStatus;
  revision: number;
  content: string;
  mindMap?: ChapterMindMap;
  dialogueContent: AiDialogueContentItem[];
  notesRevision: number;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  error?: string;
  controller: AbortController;
  userMessage: ChatMessage;
  session: ChatSession;
  finalResult?: AiResult;
  committing?: boolean;
}

export interface AiChatContext {
  config: OpenAICompatibleConfig;
  model: string;
  reasoningEffort?: ReasoningEffort;
  conversationId: string;
  messages: Array<
    Pick<ChatMessage, 'role' | 'content' | 'quote'> & Partial<Pick<ChatMessage, 'createdAt'>>
  >;
  resourceType: 'book';
  purpose: JobPurpose;
  book: BookItem;
  currentText: string;
  notes: NoteItem[];
  highlights: HighlightItem[];
  readingSessions: ReadingSession[];
  webSearchConfig: WebSearchConfig;
  assistantPrompt: string;
  videoNarration?: VideoNarrationContext;
  videoPhase?: VideoGenerationPhase;
}

export type AiChatRunner = (
  input: AiChatContext & {
    signal: AbortSignal;
    onProgress: (progress: AiResult) => void;
    onNoteChange: () => void;
  },
) => Promise<AiResult>;

export interface AiJobRequest {
  resourceType?: unknown;
  purpose?: unknown;
  termId?: unknown;
  chapterId?: unknown;
  videoNarration?: unknown;
  configId?: unknown;
  model?: unknown;
  reasoningEffort?: unknown;
  bookId?: unknown;
  conversationId?: unknown;
  currentText?: unknown;
  userMessage?: {
    id?: unknown;
    content?: unknown;
    createdAt?: number;
    quote?: { text?: unknown; chapter?: unknown };
  };
  session?: { title?: unknown; createdAt?: number };
}
