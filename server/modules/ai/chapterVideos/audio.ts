import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ChapterVideoScene } from '../../../../contracts/reading.js';
import { runMediaCommand, synthesizeNarration } from './media.js';
import type { VideoNarrationContext } from './media.js';

export async function prepareSceneAudio(
  scene: ChapterVideoScene,
  narration: VideoNarrationContext | undefined,
  directory: string,
  index: number,
  signal: AbortSignal,
  onBeat?: (index: number, count: number) => void,
) {
  const texts = scene.beats?.map((beat) => beat.text) ?? [scene.narration];
  const files: string[] = [];
  const durations: number[] = [];
  const sourceFormat = narration?.tts ? 'wav' : 'mp3';
  for (const [beatIndex, text] of texts.entries()) {
    signal.throwIfAborted();
    onBeat?.(beatIndex + 1, texts.length);
    if (!narration) {
      durations.push(Math.max(3, Array.from(text).length / 4.2));
      continue;
    }
    const file = `audio-${index}-${beatIndex}.${sourceFormat}`;
    await writeFile(join(directory, file), await synthesizeNarration(narration, text, signal), {
      mode: 0o600,
    });
    // Measure decoded PCM so MP3 encoder delay cannot accumulate between beats.
    const normalized = `audio-${index}-${beatIndex}-normalized.wav`;
    await writeFile(join(directory, normalized), '', { mode: 0o600 });
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
        sourceFormat,
        '-i',
        file,
        '-t',
        '181',
        '-ar',
        '48000',
        '-ac',
        '2',
        '-c:a',
        'pcm_s16le',
        normalized,
      ],
      directory,
      signal,
    );
    const duration = Number(
      await runMediaCommand(
        'ffprobe',
        [
          '-v',
          'error',
          '-protocol_whitelist',
          'file,pipe',
          '-f',
          'wav',
          '-i',
          normalized,
          '-show_entries',
          'format=duration',
          '-of',
          'default=noprint_wrappers=1:nokey=1',
        ],
        directory,
        signal,
      ),
    );
    if (!Number.isFinite(duration) || duration <= 0 || duration > 180)
      throw new Error('配音音频时长无效或过长，请检查语音模型');
    files.push(normalized);
    durations.push(duration + (scene.beats ? 0.16 : 0));
  }
  let cursor = 0;
  scene.beats?.forEach((beat, beatIndex) => {
    beat.startSeconds = cursor;
    beat.durationSeconds = durations[beatIndex];
    cursor += durations[beatIndex];
  });
  const contentDuration = durations.reduce((sum, duration) => sum + duration, 0);
  const duration =
    Math.ceil(Math.max(narration ? 3 : 8, contentDuration + (narration ? 0.4 : 0)) * 30) / 30;
  if (!narration) return { duration, audioName: undefined, audioFormat: sourceFormat };
  if (!scene.beats) return { duration, audioName: files[0], audioFormat: 'wav' };
  const audioName = `audio-${index}.wav`;
  await writeFile(join(directory, audioName), '', { mode: 0o600 });
  const filters = files.map(
    (_, beatIndex) =>
      `[${beatIndex}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,apad=pad_dur=0.16,asetpts=PTS-STARTPTS[b${beatIndex}]`,
  );
  filters.push(
    `${files.map((_, beatIndex) => `[b${beatIndex}]`).join('')}concat=n=${files.length}:v=0:a=1[voice]`,
  );
  await runMediaCommand(
    'ffmpeg',
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-nostdin',
      '-y',
      ...files.flatMap((file) => ['-protocol_whitelist', 'file,pipe', '-f', 'wav', '-i', file]),
      '-filter_complex',
      filters.join(';'),
      '-map',
      '[voice]',
      '-c:a',
      'pcm_s16le',
      audioName,
    ],
    directory,
    signal,
  );
  return { duration, audioName, audioFormat: 'wav' };
}
