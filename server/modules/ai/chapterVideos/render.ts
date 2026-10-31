import { chmod, mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ChapterVideo } from '../../../../contracts/reading.js';
import { chapterVideoDirectoryPath, chapterVideoPath } from '../../../infrastructure/fs/files.js';
import { removeChapterVideoFiles } from '../../books/chapterVideos.js';
import { publishChapterVideo } from '../../books/imageHosting.js';
import { readPersistedState } from '../../state/stateStore.js';
import { runMediaCommand, type VideoNarrationContext } from './media.js';
import { createMotionRenderer } from './motion.js';
import { prepareSceneAudio } from './audio.js';

// Only one encode runs at a time, including across books. Cancellation propagates
// to FFmpeg and every network request, while temporary files stay private.
let renderQueue = Promise.resolve();

export async function renderChapterVideo(
  video: ChapterVideo,
  bookTitle: string,
  narration: VideoNarrationContext | undefined,
  signal: AbortSignal,
  onProgress: (stage: string) => void,
): Promise<ChapterVideo> {
  onProgress('正在等待视频渲染');
  const result = renderQueue.then(async () => {
    signal.throwIfAborted();
    const current = await readPersistedState({
      fields: ['books'],
      hydrateNote: () => false,
      hydrateCovers: false,
    });
    if (!current?.state.books?.some((book) => book.id === video.bookId))
      throw new Error('书籍已移入回收站或删除，视频未保存');
    const directory = chapterVideoDirectoryPath(video.bookId);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const temporary = await mkdtemp(join(directory, '.render-'));
    let finished = false;
    let motion: Awaited<ReturnType<typeof createMotionRenderer>> | undefined;
    try {
      await runMediaCommand('ffmpeg', ['-version'], temporary, signal);
      motion = await createMotionRenderer(signal);
      const next = structuredClone(video);
      let cursor = 0;
      for (const [index, scene] of next.scenes.entries()) {
        signal.throwIfAborted();
        onProgress(
          `${narration ? '正在配音并绘制' : '正在绘制'}分镜 ${index + 1}/${next.scenes.length}`,
        );
        const { duration, audioName, audioFormat } = await prepareSceneAudio(
          scene,
          narration,
          temporary,
          index,
          signal,
          (part, count) => {
            if (narration)
              onProgress(`正在配音 ${index + 1}/${next.scenes.length} · 段落 ${part}/${count}`);
          },
        );
        scene.startSeconds = cursor;
        scene.durationSeconds = duration;
        cursor += duration;
        if (cursor > 1800) throw new Error('视频超过 30 分钟单次上限，请选择较小章节');
        await motion.render(
          { scene, bookTitle, chapterTitle: video.chapterTitle, index, count: next.scenes.length },
          duration,
          join(temporary, `motion-${index}.mp4`),
          index === 0 ? join(temporary, 'poster.png') : undefined,
          (percent) =>
            onProgress(`正在渲染动态图 ${index + 1}/${next.scenes.length} · ${percent}%`),
        );
        await writeFile(join(temporary, `scene-${index}.mp4`), '', { mode: 0o600 });
        onProgress(`正在渲染视频 ${index + 1}/${next.scenes.length}`);
        await runMediaCommand(
          'ffmpeg',
          [
            '-hide_banner',
            '-loglevel',
            'error',
            '-nostdin',
            '-y',
            '-protocol_whitelist',
            'file,pipe',
            '-i',
            `motion-${index}.mp4`,
            ...(audioName
              ? ['-protocol_whitelist', 'file,pipe', '-f', audioFormat, '-i', audioName]
              : []),
            '-map',
            '0:v:0',
            ...(audioName
              ? [
                  '-map',
                  '1:a:0',
                  '-af',
                  'apad',
                  '-c:a',
                  'aac',
                  '-ar',
                  '48000',
                  '-ac',
                  '2',
                  '-b:a',
                  '128k',
                ]
              : ['-an']),
            '-c:v',
            'copy',
            '-t',
            duration.toFixed(6),
            `scene-${index}.mp4`,
          ],
          temporary,
          signal,
        );
      }
      onProgress('正在合成并保存视频');
      await writeFile(
        join(temporary, 'scenes.txt'),
        next.scenes.map((_, index) => `file 'scene-${index}.mp4'`).join('\n'),
        { mode: 0o600 },
      );
      await writeFile(join(temporary, 'video.mp4'), '', { mode: 0o600 });
      await runMediaCommand(
        'ffmpeg',
        [
          '-hide_banner',
          '-loglevel',
          'error',
          '-nostdin',
          '-y',
          '-protocol_whitelist',
          'file,pipe',
          '-f',
          'concat',
          '-safe',
          '1',
          '-i',
          'scenes.txt',
          '-c',
          'copy',
          '-movflags',
          '+faststart',
          'video.mp4',
        ],
        temporary,
        signal,
      );
      signal.throwIfAborted();
      await chmod(join(temporary, 'video.mp4'), 0o600);
      await chmod(join(temporary, 'poster.png'), 0o600);
      const mp4Path = chapterVideoPath(video.bookId, video.id, 'mp4');
      const posterPath = chapterVideoPath(video.bookId, video.id, 'png');
      await rename(join(temporary, 'video.mp4'), mp4Path);
      await rename(join(temporary, 'poster.png'), posterPath);
      signal.throwIfAborted();
      next.durationSeconds = cursor;
      const hosted = await publishChapterVideo({
        bookId: video.bookId,
        videoId: video.id,
        mp4Path,
        posterPath,
        signal,
        onStart: () => onProgress('正在上传视频到腾讯云 COS'),
      });
      if (hosted.cosUrl) next.cosUrl = hosted.cosUrl;
      if (hosted.posterCosUrl) next.posterCosUrl = hosted.posterCosUrl;
      finished = true;
      return next;
    } finally {
      await motion?.close().catch(() => undefined);
      if (!finished) await removeChapterVideoFiles(video.bookId, video.id);
      await rm(temporary, { recursive: true, force: true });
    }
  });
  renderQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}
