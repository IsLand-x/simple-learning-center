import type { BookSearchIndex } from './type';
import { apiTransport } from '../http/transport';

export class ReadingApi {
  constructor(private readonly transport = apiTransport) {}

  async saveSearchIndex(bookId: string, index: BookSearchIndex): Promise<void> {
    await this.transport.request(`/api/search-indexes/${encodeURIComponent(bookId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(index),
    });
  }

  async loadSearchIndex(bookId: string): Promise<BookSearchIndex | undefined> {
    const response = await this.transport.fetchResponse(
      `/api/search-indexes/${encodeURIComponent(bookId)}`,
    );
    if (response.status === 404) return undefined;
    if (!response.ok) throw new Error(`读取书内搜索索引失败（${response.status}）`);
    return response.json() as Promise<BookSearchIndex>;
  }
}

export const readingApi = new ReadingApi();
