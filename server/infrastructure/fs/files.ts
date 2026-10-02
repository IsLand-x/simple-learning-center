import { createReadStream, createWriteStream } from 'node:fs';
import { access, mkdir, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import {
  BOOK_DIRECTORY,
  COVER_DIRECTORY,
  DATA_DIRECTORY,
  NOTE_DIRECTORY,
  SEARCH_INDEX_DIRECTORY,
} from '../../config.js';
import { errorHasCode, statusError } from '../http/errors.js';

function encodedId(value: unknown) {
  if (typeof value !== 'string' || !value || value.length > 200 || value.includes('\0')) {
    throw statusError(400, '资源标识不正确');
  }
  // encodeURIComponent leaves dots untouched. Escaping them prevents special
  // path segments such as `..` from ever reaching join().
  return encodeURIComponent(value).replaceAll('.', '%2E');
}

export function bookPath(bookId: string) {
  return join(BOOK_DIRECTORY, `${encodedId(bookId)}.epub`);
}

export function coverDirectoryPath(bookId: string) {
  return join(COVER_DIRECTORY, encodedId(bookId));
}

export async function findBookCoverPath(bookId: string) {
  const directory = coverDirectoryPath(bookId);
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    const entry = entries.find(
      (candidate) =>
        candidate.isFile() && /^cover\.(?:avif|gif|jpe?g|png|svg|webp)$/i.test(candidate.name),
    );
    return entry ? join(directory, entry.name) : null;
  } catch (error) {
    if (errorHasCode(error, 'ENOENT')) return null;
    throw error;
  }
}

export function searchIndexPath(bookId: string) {
  return join(SEARCH_INDEX_DIRECTORY, `${encodedId(bookId)}.json`);
}

export function knowledgeMapDirectoryPath(bookId: string) {
  return join(DATA_DIRECTORY, 'knowledge-maps', encodedId(bookId));
}

export function noteDirectoryPath(bookId: string) {
  return join(NOTE_DIRECTORY, encodedId(bookId));
}

export function notePath(bookId: string, noteId: string) {
  return join(noteDirectoryPath(bookId), `${encodedId(noteId)}.md`);
}

export async function exists(path: string) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function initializeDataDirectories() {
  await Promise.all([
    mkdir(BOOK_DIRECTORY, { recursive: true, mode: 0o700 }),
    mkdir(COVER_DIRECTORY, { recursive: true, mode: 0o700 }),
    mkdir(NOTE_DIRECTORY, { recursive: true, mode: 0o700 }),
    mkdir(SEARCH_INDEX_DIRECTORY, { recursive: true, mode: 0o700 }),
  ]);
}

export async function atomicWrite(path: string, data: Parameters<typeof writeFile>[1]) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporaryPath = `${path}.${process.pid}.${Date.now()}.tmp`;
  try {
    await writeFile(temporaryPath, data, { mode: 0o600 });
    await rename(temporaryPath, path);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

export async function writeRequestToFile(
  readable: NodeJS.ReadableStream,
  targetPath: string,
  maxBytes: number,
) {
  await mkdir(dirname(targetPath), { recursive: true, mode: 0o700 });
  const temporaryPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`;
  let size = 0;
  const limiter = new Transform({
    transform(chunk, _encoding, callback) {
      size += chunk.length;
      const error = size > maxBytes ? statusError(413, '上传文件过大') : null;
      callback(error, chunk);
    },
  });
  try {
    await pipeline(readable, limiter, createWriteStream(temporaryPath, { mode: 0o600 }));
    if (!size) throw statusError(400, '上传文件为空');
    await rename(temporaryPath, targetPath);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

export async function fileResponse(path: string, requestMethod = 'GET') {
  const fileStat = await stat(path);
  if (!fileStat.isFile()) return null;
  const body = requestMethod === 'HEAD' ? null : Readable.toWeb(createReadStream(path));
  return new Response(body as ReadableStream<Uint8Array> | null, {
    headers: { 'Content-Length': String(fileStat.size) },
  });
}
