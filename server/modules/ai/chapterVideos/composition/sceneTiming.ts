import type { ChapterVideoBeat, ChapterVideoScene } from '../../../../../contracts/reading.js';

export function sceneTiming(scene: ChapterVideoScene, seconds: number, duration: number) {
  const measured = scene.beats?.length && scene.beats.every((beat) => beat.durationSeconds > 0);
  const beats: ChapterVideoBeat[] = measured
    ? scene.beats!
    : scene.points.map((_, index) => ({
        text: '',
        focus: 'point',
        pointIndex: index,
        startSeconds: (index * duration) / scene.points.length,
        durationSeconds: duration / scene.points.length,
      }));
  const current = Math.max(
    0,
    beats.findLastIndex((beat) => seconds >= beat.startSeconds),
  );
  const beat = beats[current];
  const progress = (focus: ChapterVideoBeat['focus'], fallback: number) => {
    const target = beats.find((item) => item.focus === focus);
    if (measured && !target) return focus === 'price' || focus === 'quantities' ? 1 : 0;
    const start = target?.startSeconds ?? duration * fallback;
    return Math.max(
      0,
      Math.min(
        1,
        (seconds - start) /
          Math.min(1.2, Math.max(0.3, (target?.durationSeconds ?? duration * 0.2) * 0.4)),
      ),
    );
  };
  return {
    beat,
    index: current,
    progress,
    point: beat?.pointIndex ?? Math.min(current, scene.points.length - 1),
  };
}
