import type { BookItem } from '../../../contracts/books.js';
import { randomUUID } from 'node:crypto';
import { rm, stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { bookPath, coverDirectoryPath, writeRequestToFile } from '../../infrastructure/fs/files.js';
import { mutatePersistedState } from '../state/stateStore.js';
import { statusError } from '../../infrastructure/http/errors.js';
import { readEpubMetadata } from './epub.js';

const MAX_IMPORT_BYTES = 100 * 1024 * 1024;

export async function importBook(request: Request, fileName: string) {
  if (!request.body) throw statusError(400, '上传文件为空');
  if (Number(request.headers.get('content-length')) > MAX_IMPORT_BYTES)
    throw statusError(413, '上传文件过大');
  const id = randomUUID();
  const path = bookPath(id);
  try {
    await writeRequestToFile(
      Readable.fromWeb(request.body as import('node:stream/web').ReadableStream<Uint8Array>),
      path,
      MAX_IMPORT_BYTES,
    );
    const metadata = await readEpubMetadata(path);
    const now = Date.now();
    const book: BookItem = {
      id,
      kind: 'epub',
      ...metadata,
      title: metadata.title || fileName.replace(/\.epub$/i, ''),
      author: metadata.author || '未知作者',
      fileName,
      fileSize: (await stat(path)).size,
      createdAt: now,
      updatedAt: now,
      progress: 0,
      currentChapter: metadata.toc[0]?.label || '开始阅读',
      currentPage: 1,
    };
    await mutatePersistedState((persisted) => {
      persisted.state.books = [book, ...(persisted.state.books || [])];
      persisted.version = Math.max(persisted.version || 0, 25);
    });
    const { coverDataUrl: _cover, ...result } = book;
    return result;
  } catch (error) {
    await Promise.all([
      rm(path, { force: true }),
      rm(coverDirectoryPath(id), { recursive: true, force: true }),
    ]);
    throw error;
  }
}
