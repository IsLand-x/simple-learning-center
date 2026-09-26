import type {
  BookResourcesResponse,
  DeleteBookResponse,
  EpubFile,
  RenameBookResourceRequest,
  RestoreBookResponse,
  SaveBookResourceRequest,
  TrashBookResponse,
} from '../types/books';
import type { ApiErrorResponse } from '../types/http';
import { apiTransport } from './transport';

export class BooksApi {
  constructor(private readonly transport = apiTransport) {}

  async saveEpubFile(bookId: string, data: EpubFile): Promise<void> {
    await this.transport.request(`/api/books/${encodeURIComponent(bookId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/epub+zip' },
      body: data,
    });
  }

  async loadEpubFile(bookId: string): Promise<EpubFile | undefined> {
    const response = await this.transport.fetchResponse(`/api/books/${encodeURIComponent(bookId)}`);
    if (response.status === 404) return undefined;
    if (!response.ok) {
      let message = `读取书籍文件失败（${response.status}）`;
      try {
        const payload = (await response.json()) as ApiErrorResponse;
        if (typeof payload.error === 'string') message = payload.error;
      } catch {
        // Keep the status-based message.
      }
      throw new Error(message);
    }
    return response.arrayBuffer();
  }

  moveToTrash(bookId: string): Promise<TrashBookResponse> {
    return this.transport.json(`/api/books/${encodeURIComponent(bookId)}/trash`, {
      method: 'POST',
    });
  }

  restoreFromTrash(bookId: string): Promise<RestoreBookResponse> {
    return this.transport.json(`/api/books/${encodeURIComponent(bookId)}/restore`, {
      method: 'POST',
    });
  }

  permanentlyDelete(bookId: string): Promise<DeleteBookResponse> {
    return this.transport.json(`/api/books/${encodeURIComponent(bookId)}`, { method: 'DELETE' });
  }

  listResources(bookId: string): Promise<BookResourcesResponse> {
    return this.transport.json(`/api/books/${encodeURIComponent(bookId)}/resources`);
  }

  saveResource(bookId: string, input: SaveBookResourceRequest): Promise<BookResourcesResponse> {
    return this.transport.json(`/api/books/${encodeURIComponent(bookId)}/resources`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
  }

  renameResource(
    bookId: string,
    imageId: string,
    input: RenameBookResourceRequest,
  ): Promise<BookResourcesResponse> {
    return this.transport.json(`/api/books/${encodeURIComponent(bookId)}/resources/${imageId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
  }

  removeResource(bookId: string, imageId: string): Promise<BookResourcesResponse> {
    return this.transport.json(`/api/books/${encodeURIComponent(bookId)}/resources/${imageId}`, {
      method: 'DELETE',
    });
  }
}

export const booksApi = new BooksApi();
