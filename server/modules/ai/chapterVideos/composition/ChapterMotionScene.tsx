import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import type { ChapterVideoScene } from '../../../../../contracts/reading.js';
import { TradeMarket } from './TradeMarket.js';
import { ConceptMotion } from './ConceptMotion.js';
import { ComparisonMotion } from './ComparisonMotion.js';
import { LedgerMotion } from './LedgerMotion.js';
import { createTimedSceneCaptions } from './captions.js';
import { videoColors as c } from './palette.js';

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
  const captions = createTimedSceneCaptions(scene, (durationInFrames / fps) * 1000);
  const caption = (
    captions.find(
      (item) => (frame / fps) * 1000 >= item.startMs && (frame / fps) * 1000 < item.endMs,
    ) ?? captions.at(-1)
  )?.text;
  return (
    <AbsoluteFill
      style={{
        background: c.paper,
        color: c.ink,
        fontFamily: '"Noto Sans CJK SC", sans-serif',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 30,
          left: 68,
          right: 68,
          display: 'flex',
          justifyContent: 'space-between',
          gap: 24,
          fontSize: 19,
          color: c.muted,
        }}
      >
        <span
          style={{
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {bookTitle} · {chapterTitle}
        </span>
        <span style={{ flexShrink: 0 }}>
          第 {index + 1} / {count} 节
        </span>
      </div>
      <div
        style={{
          opacity: interpolate(frame, [0, fps * 0.2], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          }),
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 78,
            left: 68,
            right: 68,
            fontSize: scene.title.length > 23 ? 46 : 54,
            fontWeight: 700,
            lineHeight: 1.12,
            letterSpacing: -0.5,
          }}
        >
          {scene.title}
        </div>
        {scene.visual?.kind === 'trade' ? (
          <TradeMarket scene={scene} />
        ) : scene.visual?.kind === 'ledger' ? (
          <LedgerMotion scene={scene} />
        ) : scene.visual?.kind === 'comparison' ? (
          <ComparisonMotion scene={scene} />
        ) : (
          <ConceptMotion scene={scene} />
        )}
      </div>
      {scene.visual?.example === 'linear-trade' ? (
        <div style={{ position: 'absolute', left: 76, bottom: 96, color: c.muted, fontSize: 18 }}>
          教学算例，非原书或现实统计 · 小国、世界价格给定
          {scene.visual.mode === 'quota' ? ' · 许可证免费发给本国持证人' : ''}
        </div>
      ) : (
        scene.visual?.kind === 'trade' && (
          <div style={{ position: 'absolute', left: 76, bottom: 96, color: c.muted, fontSize: 18 }}>
            小国、世界价格给定 · 定性机制示意
          </div>
        )
      )}
      <div
        style={{
          position: 'absolute',
          left: 68,
          right: 68,
          bottom: 25,
          textAlign: 'center',
          fontSize: 34,
          lineHeight: 1.35,
          fontWeight: 500,
          color: c.ink,
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
          width: `${(100 * frame) / durationInFrames}%`,
          background: c.trade,
        }}
      />
    </AbsoluteFill>
  );
}
