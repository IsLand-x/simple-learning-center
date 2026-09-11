import type { VideoCaptionCue } from '../../../types';

export type VideoPanel = 'transcript' | 'ai';
export type TranscriptMode = 'original' | 'chinese' | 'bilingual';

export function formatVideoTime(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds || 0));
  const hours = Math.floor(safeSeconds / 3_600);
  const minutes = Math.floor((safeSeconds % 3_600) / 60);
  const remainder = safeSeconds % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
    : `${minutes}:${String(remainder).padStart(2, '0')}`;
}

export function cueAt(cues: VideoCaptionCue[], seconds: number) {
  let current: VideoCaptionCue | undefined;
  for (const cue of cues) {
    if (cue.startSeconds > seconds + 0.25) break;
    current = cue;
  }
  return current;
}

export function matchingCue(cues: VideoCaptionCue[], startSeconds: number) {
  let best: VideoCaptionCue | undefined;
  let distance = Number.POSITIVE_INFINITY;
  for (const cue of cues) {
    const nextDistance = Math.abs(cue.startSeconds - startSeconds);
    if (nextDistance < distance) {
      best = cue;
      distance = nextDistance;
    }
    if (cue.startSeconds > startSeconds + 2) break;
  }
  return distance <= 2 ? best : undefined;
}
