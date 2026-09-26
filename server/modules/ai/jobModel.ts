import type {
  AiDialogueContentItem,
  ChatMessage,
  RssDigestRun,
} from '../../../contracts/domain.js';
import type { StoredState } from '../state/types.js';
import type { AiJob, ReasoningEffort } from './types.js';
import { statusError } from '../../infrastructure/http/errors.js';

const MAX_RETAINED_DIGEST_RUNS = 100;
const AI_REASONING_EFFORTS = new Set(['minimal', 'low', 'medium', 'high', 'xhigh', 'max']);

export function upsertDigestRun(state: StoredState, run: RssDigestRun) {
  const runs = Array.isArray(state.rssDigestRuns) ? state.rssDigestRuns : [];
  state.rssDigestRuns = [run, ...runs.filter((item) => item.id !== run.id)]
    .sort((left, right) => Number(right.startedAt || 0) - Number(left.startedAt || 0))
    .slice(0, MAX_RETAINED_DIGEST_RUNS);
}

export function requiredString(value: unknown, label: string, maxLength: number) {
  if (typeof value !== 'string' || !value.trim() || value.length > maxLength) {
    throw statusError(400, `${label}不正确`);
  }
  return value.trim();
}

export function optionalString(value: unknown, maxLength: number) {
  return typeof value === 'string' ? value.slice(0, maxLength) : '';
}

export function optionalReasoningEffort(value: unknown): ReasoningEffort | undefined {
  if (value === undefined || value === null || value === '' || value === 'auto') return undefined;
  if (!AI_REASONING_EFFORTS.has(value as string)) throw statusError(400, '推理强度不正确');
  return value as ReasoningEffort;
}

export function isCancelled(job: AiJob) {
  return job.status === 'cancelled';
}

export function publicJob(job: AiJob) {
  return {
    id: job.id,
    bookId: job.bookId,
    resourceType: job.resourceType,
    rssItemId: job.rssItemId,
    videoId: job.videoId,
    digestDate: job.digestDate,
    purpose: job.purpose,
    conversationId: job.conversationId,
    userMessageId: job.userMessageId,
    assistantMessageId: job.assistantMessageId,
    status: job.status,
    revision: job.revision,
    content: job.content,
    translationHtml: job.translationHtml,
    dialogueContent: job.dialogueContent,
    notesRevision: job.notesRevision,
    error: job.error,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    completedAt: job.completedAt,
  };
}

export function makeConversationTitle(content: string) {
  const lines = content
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  return (lines.at(-1) || '关于本书的对话').replace(/\s+/g, ' ').slice(0, 32);
}

export function safeErrorMessage(error: unknown, secrets: unknown[] = []) {
  let message = error instanceof Error ? error.message : '模型请求失败';
  for (const secret of secrets) {
    if (typeof secret === 'string' && secret) message = message.replaceAll(secret, '[已隐藏]');
  }
  return message.replace(/Bearer\s+[^\s,;]+/gi, 'Bearer [已隐藏]');
}

export function normalizedMessage(
  message: Partial<ChatMessage>,
): Pick<ChatMessage, 'role' | 'content' | 'quote'> {
  const role = message?.role === 'assistant' ? 'assistant' : 'user';
  return {
    role,
    content: optionalString(message?.content, 100_000),
    ...(role === 'user' && message?.quote?.text
      ? {
          quote: {
            text: optionalString(message.quote.text, 20_000),
            chapter: optionalString(message.quote.chapter, 500),
          },
        }
      : {}),
  };
}

export function translatedDialogueContent(dialogueContent: AiDialogueContentItem[], text: string) {
  const items = structuredClone(Array.isArray(dialogueContent) ? dialogueContent : []);
  let messageIndex = -1;
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (items[index]?.type === 'message' && items[index]?.role === 'assistant') {
      messageIndex = index;
      break;
    }
  }
  const message = {
    ...(messageIndex >= 0 ? items[messageIndex] : {}),
    type: 'message',
    role: 'assistant',
    status: 'completed',
    content: [{ type: 'output_text', text }],
  };
  if (messageIndex >= 0) items[messageIndex] = message;
  else items.push(message);
  return items;
}
