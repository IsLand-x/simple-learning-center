import type { Caption } from '@remotion/captions';

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
