import { describe, expect, it } from 'vitest';
import { cueAt, formatVideoTime, matchingCue } from './videoTranscript';

const cues = [
  { startSeconds: 0, durationSeconds: 2, text: 'one' },
  { startSeconds: 2.5, durationSeconds: 2, text: 'two' },
  { startSeconds: 7, durationSeconds: 2, text: 'three' },
];

describe('video transcript model', () => {
  it('formats short and long video positions', () => {
    expect(formatVideoTime(65.9)).toBe('1:05');
    expect(formatVideoTime(3_665)).toBe('1:01:05');
    expect(formatVideoTime(-3)).toBe('0:00');
  });

  it('finds the latest cue at a playback position', () => {
    expect(cueAt(cues, 0)?.text).toBe('one');
    expect(cueAt(cues, 2.3)?.text).toBe('two');
    expect(cueAt(cues, 6)?.text).toBe('two');
  });

  it('matches translated cues only within the two second tolerance', () => {
    expect(matchingCue(cues, 3)?.text).toBe('two');
    expect(matchingCue(cues, 20)).toBeUndefined();
  });
});
