import { createReadStream } from 'node:fs';
import { rm, stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { chapterVideoPath } from '../../infrastructure/fs/files.js';
import { statusError } from '../../infrastructure/http/errors.js';
import { mutatePersistedState, readPersistedState } from '../state/stateStore.js';
import { removeHostedChapterVideo } from './imageHosting.js';

export async function requireChapterVideo(bookId: string, videoId: string) {
  if (!/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(videoId))
    throw statusError(400, '视频标识不正确');
  const state = (
    await readPersistedState({
      fields: ['books', 'chapterVideos'],
      hydrateNote: () => false,
      hydrateCovers: false,
    })
  )?.state;
  const video = state?.chapterVideos?.find((item) => item.bookId === bookId && item.id === videoId);
  if (!state?.books?.some((book) => book.id === bookId) || !video)
    throw statusError(404, '当前书籍的视频不存在');
  return video;
}

export async function removeChapterVideoFiles(bookId: string, videoId: string) {
  await removeHostedChapterVideo(bookId, videoId).catch(() => undefined);
  await Promise.all(
    ['mp4', 'png'].map((extension) =>
      rm(chapterVideoPath(bookId, videoId, extension as 'mp4' | 'png'), { force: true }),
    ),
  );
}

export async function deleteChapterVideo(bookId: string, videoId: string) {
  await requireChapterVideo(bookId, videoId);
  await mutatePersistedState(
    (persisted) => {
      persisted.state.chapterVideos = (persisted.state.chapterVideos ?? []).filter(
        (video) => video.bookId !== bookId || video.id !== videoId,
      );
    },
    { preserveResourceFiles: true },
  );
  await removeChapterVideoFiles(bookId, videoId);
}

export function videoByteRange(value: string | null, size: number) {
  if (value === null) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || (!match[1] && !match[2])) return false;
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(size - 1, Number(match[2])) : size - 1;
  return Number.isSafeInteger(start) &&
    Number.isSafeInteger(end) &&
    start >= 0 &&
    start <= end &&
    start < size
    ? { start, end }
    : false;
}

export async function chapterVideoResponse(request: Request, bookId: string, videoId: string) {
  await requireChapterVideo(bookId, videoId);
  const path = chapterVideoPath(bookId, videoId, 'mp4');
  let size: number;
  try {
    size = (await stat(path)).size;
  } catch {
    throw statusError(404, '视频文件不存在，请重新生成');
  }
  const range = videoByteRange(request.headers.get('Range'), size);
  const headers = new Headers({
    'Content-Type': 'video/mp4',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  if (range === false) {
    headers.set('Content-Range', `bytes */${size}`);
    return new Response(null, { status: 416, headers });
  }
  const { start, end } = range ?? { start: 0, end: size - 1 };
  headers.set('Content-Length', String(end - start + 1));
  if (range) headers.set('Content-Range', `bytes ${start}-${end}/${size}`);
  return new Response(
    request.method === 'HEAD'
      ? null
      : (Readable.toWeb(createReadStream(path, { start, end })) as ReadableStream<Uint8Array>),
    {
      status: range ? 206 : 200,
      headers,
    },
  );
}
