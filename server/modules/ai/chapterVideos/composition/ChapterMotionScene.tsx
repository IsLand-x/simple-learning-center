import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig, Easing } from 'remotion';
import type { ChapterVideoScene } from '../../../../../contracts/reading.js';
import { TradeMarket } from './TradeMarket.js';
import { ConceptMotion } from './ConceptMotion.js';
import { createSceneCaptions } from './captions.js';

export type MotionSceneProps = {
  scene: ChapterVideoScene;
  bookTitle: string;
  chapterTitle: string;
  index: number;
  count: number;
};

export function ChapterMotionScene({
  scene,
  bookTitle,
  chapterTitle,
  index,
  count,
}: MotionSceneProps) {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const entry = interpolate(frame, [0, 0.8 * fps], [0, 1], {
    extrapolateRight: 'clamp',
    extrapolateLeft: 'clamp',
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  const exit = interpolate(frame, [durationInFrames - 0.35 * fps, durationInFrames], [1, 0], {
    extrapolateRight: 'clamp',
    extrapolateLeft: 'clamp',
  });
  const captions = createSceneCaptions(scene.narration, (durationInFrames / fps) * 1000);
  const caption = (
    captions.find(
      (item) => (frame / fps) * 1000 >= item.startMs && (frame / fps) * 1000 < item.endMs,
    ) ?? captions.at(-1)
  )?.text;
  return (
    <AbsoluteFill
      style={{
        background: '#091925',
        color: '#f4f4ee',
        fontFamily: '"Noto Sans CJK SC", sans-serif',
        overflow: 'hidden',
      }}
    >
      <svg width="1280" height="720" style={{ position: 'absolute' }}>
        <defs>
          <radialGradient id="spot">
            <stop stopColor="#194455" />
            <stop offset="1" stopColor="#091925" />
          </radialGradient>
          <pattern id="grid" width="38" height="38" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="1" fill="#29404e" />
          </pattern>
        </defs>
        <rect width="1280" height="720" fill="url(#spot)" />
        <rect width="1280" height="720" fill="url(#grid)" opacity=".3" />
      </svg>
      <div
        style={{
          position: 'absolute',
          top: 38,
          left: 68,
          right: 68,
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 18,
          color: '#90a8b9',
          letterSpacing: 2,
        }}
      >
        <span
          style={{
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            marginRight: 24,
          }}
        >
          {bookTitle} · {chapterTitle}
        </span>
        <span style={{ flexShrink: 0 }}>
          {String(index + 1).padStart(2, '0')} / {String(count).padStart(2, '0')}
        </span>
      </div>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: entry * exit,
          translate: `0 ${(1 - entry) * 20}px`,
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 105,
            left: 68,
            right: 68,
            fontSize: 48,
            fontWeight: 700,
            letterSpacing: -1,
            lineHeight: 1.2,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {scene.title}
        </div>
        {scene.visual?.kind === 'trade' ? (
          <TradeMarket mode={scene.visual.mode} points={scene.points} />
        ) : (
          <ConceptMotion scene={scene} />
        )}
      </div>
      <div
        style={{
          position: 'absolute',
          left: 70,
          right: 70,
          bottom: 42,
          textAlign: 'center',
          fontSize: 28,
          lineHeight: 1.5,
          color: '#f4f4ee',
          fontWeight: 500,
        }}
      >
        {caption}
      </div>
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          height: 3,
          width: `${100 * (frame / durationInFrames)}%`,
          background: '#5fe0b9',
        }}
      />
      {scene.visual?.kind === 'trade' && (
        <div
          style={{ position: 'absolute', left: 70, bottom: 104, fontSize: 15, color: '#8098aa' }}
        >
          小国、世界价格给定 · 曲线为机制示意，非统计数据
        </div>
      )}
    </AbsoluteFill>
  );
}
