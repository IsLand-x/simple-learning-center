import type { AiDialogueContentItem, ChatSession } from '../types';
import { serverRequest } from './serverApi';

export type AiJobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface AiJob {
  id: string;
  bookId: string;
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
