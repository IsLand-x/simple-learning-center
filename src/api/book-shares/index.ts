import type { DoubanBookInfo } from '../../../contracts/books';
import { apiTransport } from '../http/transport';
import type { BookShareLink, SharedBook } from './type';

export class BookSharesApi {
  constructor(private readonly transport = apiTransport) {}
  create(bookId: string): Promise<BookShareLink> {
    return this.transport.json(`/api/books/${encodeURIComponent(bookId)}/share`, {
      method: 'POST',
    });
  }
  async revoke(bookId: string): Promise<void> {
    await this.transport.request(`/api/books/${encodeURIComponent(bookId)}/share`, {
      method: 'DELETE',
    });
  }
  get(token: string): Promise<SharedBook> {
    return this.transport.json(`/api/public/book-shares/${encodeURIComponent(token)}`, {
      credentials: 'omit',
    });
  }
  getDouban(token: string, signal: AbortSignal): Promise<DoubanBookInfo> {
    return this.transport.json(`/api/public/book-shares/${encodeURIComponent(token)}/douban`, {
      credentials: 'omit',
      signal,
    });
  }
  async loadEpub(token: string, signal: AbortSignal): Promise<ArrayBuffer> {
    const response = await this.transport.request(this.epubUrl(token), {
      credentials: 'omit',
      signal,
    });
    return response.arrayBuffer();
  }
  epubUrl(token: string) {
    return `/api/public/book-shares/${encodeURIComponent(token)}/epub`;
  }
  coverUrl(token: string) {
    return `/api/public/book-shares/${encodeURIComponent(token)}/cover`;
  }
}
export const bookSharesApi = new BookSharesApi();
