import type {
  AiJob,
  AiJobEventStream,
  AiJobListener,
  AiJobsResponse,
  ListAiJobsRequest,
  StartAiJobInput,
} from './type';
import { apiTransport } from '../http/transport';

export class AiApi {
  constructor(private readonly transport = apiTransport) {}

  startJob(input: StartAiJobInput): Promise<AiJob> {
    return this.transport.json('/api/ai/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
  }

  getJob(jobId: string): Promise<AiJob> {
    return this.transport.json(`/api/ai/jobs/${encodeURIComponent(jobId)}`);
  }

  async watchJob(jobId: string, onJob: AiJobListener, signal: AbortSignal): Promise<void> {
    const response = await this.transport.request(
      `/api/ai/jobs/${encodeURIComponent(jobId)}/events`,
      {
        headers: { Accept: 'text/event-stream' },
        signal,
      },
    );
    if (!response.body) throw new Error('浏览器不支持接收流式任务进度');

    const stream: AiJobEventStream = response.body;
    const reader = stream.getReader();
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

  async listJobs(input: ListAiJobsRequest): Promise<AiJob[]> {
    const search = new URLSearchParams({ bookId: input.bookId });
    if (input.conversationId) search.set('conversationId', input.conversationId);
    const payload = await this.transport.json<AiJobsResponse>(`/api/ai/jobs?${search}`);
    return Array.isArray(payload.jobs) ? payload.jobs : [];
  }

  cancelJob(jobId: string): Promise<AiJob> {
    return this.transport.json(`/api/ai/jobs/${encodeURIComponent(jobId)}`, { method: 'DELETE' });
  }
}

export const aiApi = new AiApi();
