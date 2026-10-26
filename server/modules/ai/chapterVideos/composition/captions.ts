import type { Caption } from '@remotion/captions';
import type { ChapterVideoScene } from '../../../../../contracts/reading.js';

export function createTimedSceneCaptions(scene: ChapterVideoScene, durationMs: number): Caption[] {
  if (!scene.beats?.length || scene.beats.some((beat) => beat.durationSeconds <= 0))
    return createSceneCaptions(scene.narration, durationMs);
  return scene.beats.flatMap((beat) =>
    createSceneCaptions(beat.text, beat.durationSeconds * 1000).map((caption) => ({
      ...caption,
      startMs: caption.startMs + beat.startSeconds * 1000,
      endMs: caption.endMs + beat.startSeconds * 1000,
    })),
  );
}

export function createSceneCaptions(text: string, durationMs: number): Caption[] {
  const chars = Array.from(text.replace(/\s+/g, ' ').trim());
  const total = chars.length;
  let cursor = 0;
  const captions: Caption[] = [];
  while (chars.length) {
    let length = Math.min(28, chars.length);
    if (chars.length > 28)
      for (let index = length - 1; index >= 14; index--) {
        if (/[，。！？；、,.!?;]/.test(chars[index])) {
          length = index + 1;
          break;
        }
      }
    const part = chars.splice(0, length).join('');
    captions.push({
      text: part,
      startMs: (cursor / total) * durationMs,
      endMs: ((cursor + length) / total) * durationMs,
      timestampMs: null,
      confidence: null,
    });
    cursor += length;
  }
  return captions;
}
