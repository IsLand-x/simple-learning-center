import type {
  AiDialogueContentItem,
  AiReasoningEffort,
  ChatMessage,
  ChatSession,
  OpenAICompatibleConfig,
} from '../../../../contracts/ai.js';
import type { BookItem } from '../../../../contracts/books.js';
import type { HighlightItem, NoteItem, ReadingSession } from '../../../../contracts/reading.js';
import type { RssDailyDigest, RssDigestRun, RssFeed, RssItem } from '../../../../contracts/rss.js';
import type { VideoResource, VideoTimestampNote } from '../../../../contracts/videos.js';
import type { WebSearchConfig } from '../../../../contracts/settings.js';
import type { prepareRssTranslationSource } from '../../rss/translation.js';

export type ReasoningEffort = Exclude<AiReasoningEffort, 'auto'>;
export type ResourceType = 'book' | 'rss' | 'video' | 'rssDigest';
export type JobPurpose = 'chat' | 'summary' | 'translation' | 'digest';
type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface AiResult {
  content: string;
  dialogueContent: AiDialogueContentItem[];
  translationHtml?: string;
}

export interface AiJob {
  id: string;
  bookId: string;
  resourceType: ResourceType;
  purpose: JobPurpose;
  rssItemId?: string;
  videoId?: string;
  digestDate?: string;
  digestRunId?: string;
  digestTrigger: 'manual' | 'schedule';
  digestScheduleKey?: string;
  digestItems: RssItem[];
  model: string;
  reasoningEffort?: ReasoningEffort;
  conversationId: string;
  userMessageId: string;
  assistantMessageId: string;
  assistantCreatedAt: number;
  status: JobStatus;
  revision: number;
  content: string;
  translationHtml?: string;
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
}

export interface AiChatContext {
  config: OpenAICompatibleConfig;
  model: string;
  reasoningEffort?: ReasoningEffort;
  conversationId: string;
  messages: Array<
    Pick<ChatMessage, 'role' | 'content' | 'quote'> & Partial<Pick<ChatMessage, 'createdAt'>>
  >;
  resourceType: ResourceType;
  purpose: JobPurpose;
  book?: BookItem;
  rssItem?: RssItem;
  rssFeed?: RssFeed;
  translationSource?: ReturnType<typeof prepareRssTranslationSource>;
  relatedRssItems?: RssItem[];
  digestItems?: RssItem[];
  digestFeeds?: RssFeed[];
  previousDigest?: RssDailyDigest;
  video?: VideoResource;
  videoTimestampNotes?: VideoTimestampNote[];
  currentText: string;
  notes: NoteItem[];
  highlights: HighlightItem[];
  readingSessions: ReadingSession[];
  webSearchConfig: WebSearchConfig;
  assistantPrompt: string;
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
  configId?: unknown;
  model?: unknown;
  reasoningEffort?: unknown;
  bookId?: unknown;
  rssItemId?: unknown;
  videoId?: unknown;
  digestDate?: unknown;
  digestRunId?: unknown;
  digestTrigger?: unknown;
  digestScheduleKey?: unknown;
  digestRunStartedAt?: number;
  digestItemIds?: string[];
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

export interface DigestInput {
  date?: unknown;
  force?: boolean;
  trigger?: string;
  scheduleKey?: string;
}

export type DigestAttempt = Pick<RssDigestRun, 'status'> &
  Partial<Pick<RssDigestRun, 'message' | 'model' | 'itemCount'>>;
