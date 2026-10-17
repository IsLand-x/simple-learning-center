import { apiTransport } from '../http/transport';
import type { ConversationChanges, ConversationMessagesPage, ConversationPage } from './type';

export class ConversationsApi {
  private readonly cache = new Map<string, { etag: string; data: unknown }>();
  constructor(private readonly transport = apiTransport) {}

  private async read<Result>(path: string): Promise<Result> {
    const cached = this.cache.get(path);
    const response = await this.transport.request(
      path,
      cached ? { headers: { 'If-None-Match': cached.etag } } : undefined,
      [304],
    );
    if (response.status === 304 && cached) return cached.data as Result;
    const data = (await response.json()) as Result;
    const etag = response.headers.get('ETag');
    if (etag) {
      this.cache.delete(path);
      this.cache.set(path, { etag, data });
      if (this.cache.size > 64) this.cache.delete(this.cache.keys().next().value!);
    }
    return data;
  }

  list(bookId: string, cursor?: string): Promise<ConversationPage> {
    const query = new URLSearchParams({ bookId });
    if (cursor) query.set('cursor', cursor);
    return this.read(`/api/conversations?${query}`);
  }

  messages(
    bookId: string,
    conversationId: string,
    before?: string,
  ): Promise<ConversationMessagesPage> {
    const query = new URLSearchParams({ bookId });
    if (before) query.set('before', before);
    return this.read(`/api/conversations/${encodeURIComponent(conversationId)}/messages?${query}`);
  }

  async update(id: string, changes: ConversationChanges): Promise<void> {
    await this.transport.request(`/api/conversations/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(changes),
    });
  }

  async markRead(id: string, messageIds: string[]): Promise<void> {
    await this.transport.request(`/api/conversations/${encodeURIComponent(id)}/read`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messageIds }),
    });
  }

  async delete(id: string): Promise<void> {
    await this.transport.request(`/api/conversations/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  }
}

export const conversationsApi = new ConversationsApi();
