import type { AiDialogueContentItem, ChatSession } from '../types';
import { serverRequest } from './serverApi';

export type AiJobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

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
  dialogueContent: AiDialogueContentItem[];
  error?: string;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
}

export interface StartAiJobInput {
  configId: string;
  model: string;
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

export async function startAiJob(input: StartAiJobInput) {
  const response = await serverRequest('/api/ai/jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return response.json() as Promise<AiJob>;
}

export async function getAiJob(jobId: string) {
  const response = await serverRequest(`/api/ai/jobs/${encodeURIComponent(jobId)}`);
  return response.json() as Promise<AiJob>;
}

export async function watchAiJob(
  jobId: string,
  onJob: (job: AiJob) => void,
  signal: AbortSignal,
) {
  const response = await serverRequest(`/api/ai/jobs/${encodeURIComponent(jobId)}/events`, {
    headers: { Accept: 'text/event-stream' },
    signal,
  });
  if (!response.body) throw new Error('浏览器不支持接收流式任务进度');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const processEvent = (rawEvent: string) => {
    let eventName = 'message';
    const data: string[] = [];
    for (const line of rawEvent.split('\n')) {
      if (line.startsWith('event:')) eventName = line.slice(6).trim();
      if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
    }
    if (eventName !== 'job' || !data.length) return;
    onJob(JSON.parse(data.join('\n')) as AiJob);
  };

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    let boundary = buffer.indexOf('\n\n');
    while (boundary >= 0) {
      processEvent(buffer.slice(0, boundary));
      buffer = buffer.slice(boundary + 2);
      boundary = buffer.indexOf('\n\n');
    }
    if (done) break;
  }
  if (buffer.trim()) processEvent(buffer);
}

export async function listAiJobs(bookId: string, conversationId: string) {
  const search = new URLSearchParams({ bookId, conversationId });
  const response = await serverRequest(`/api/ai/jobs?${search}`);
  const payload = await response.json() as { jobs?: AiJob[] };
  return Array.isArray(payload.jobs) ? payload.jobs : [];
}

export async function cancelAiJob(jobId: string) {
  const response = await serverRequest(`/api/ai/jobs/${encodeURIComponent(jobId)}`, {
    method: 'DELETE',
  });
  return response.json() as Promise<AiJob>;
}
