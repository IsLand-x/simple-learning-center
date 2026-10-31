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

const LAYOUT_LABELS: Record<ChapterVideoScene['layout'], string> = {
  concept: '核心机制',
  steps: '推导链条',
  compare: '维度对比',
  summary: '要点归纳',
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
  const layoutLabel = LAYOUT_LABELS[scene.layout] ?? '课程讲解';
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
          top: 24,
          left: 68,
          right: 68,
          paddingBottom: 12,
          borderBottom: `1px solid ${c.line}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 24,
          fontSize: 18,
          color: c.muted,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <span
            style={{
              flexShrink: 0,
              padding: '2px 10px',
              borderRadius: 4,
              background: c.highlight,
              color: c.trade,
              fontSize: 16,
              fontWeight: 700,
            }}
          >
            {layoutLabel}
          </span>
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
        </div>
        <span style={{ flexShrink: 0, fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
          单元 {index + 1} / {count}
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
            top: 76,
            left: 68,
            right: 68,
            fontSize: scene.title.length > 23 ? 44 : 52,
            fontWeight: 700,
            lineHeight: 1.14,
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
          bottom: 22,
          textAlign: 'center',
          fontSize: 32,
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
          right: 0,
          height: 4,
          background: c.line,
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${(100 * frame) / durationInFrames}%`,
            background: c.trade,
          }}
        />
      </div>
    </AbsoluteFill>
  );
}
