import { useCurrentFrame, useVideoConfig } from 'remotion';
import type { ChapterVideoScene } from '../../../../../contracts/reading.js';
import { videoColors as c } from './palette.js';
import { sceneTiming } from './sceneTiming.js';

export function ConceptMotion({ scene }: { scene: ChapterVideoScene }) {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const timing = sceneTiming(scene, frame / fps, durationInFrames / fps);
  const rowHeight = 368 / scene.points.length;
  return (
    <svg
      width="1280"
      height="430"
      viewBox="0 0 1280 430"
      style={{ position: 'absolute', top: 180 }}
    >
      <defs>
        <marker
          id="relation-arrow"
          markerWidth="8"
          markerHeight="8"
          refX="7"
          refY="4"
          orient="auto"
        >
          <path d="M0 0L8 4L0 8Z" fill={c.trade} />
        </marker>
      </defs>
      {(scene.visual?.connections ?? []).map((edge, index) => {
        const start = 28 + (edge.from + 0.5) * rowHeight;
        const end = 28 + (edge.to + 0.5) * rowHeight;
        return (
          <g
            key={index}
            opacity={timing.point === edge.from || timing.point === edge.to ? 1 : 0.45}
          >
            <line
              x1="106"
              x2="106"
              y1={start + 10}
              y2={end - 12}
              stroke={c.trade}
              strokeWidth="2.5"
              markerEnd="url(#relation-arrow)"
            />
            <foreignObject x="8" y={(start + end) / 2 - 35} width="84" height="74">
              <div
                style={{
                  color: c.trade,
                  fontSize: 18,
                  lineHeight: 1.2,
                  textAlign: 'right',
                  overflowWrap: 'anywhere',
                }}
              >
                {edge.label}
              </div>
            </foreignObject>
          </g>
        );
      })}
      {scene.points.map((point, index) => {
        const active = index === timing.point;
        const top = 28 + index * rowHeight;
        return (
          <g key={index}>
            {active && (
              <rect x="124" y={top} width="1090" height={rowHeight - 6} rx="4" fill={c.highlight} />
            )}
            <line
              x1="138"
              x2="138"
              y1={top + 12}
              y2={top + rowHeight - 18}
              stroke={active ? c.trade : c.line}
              strokeWidth={active ? 4 : 2}
            />
            <foreignObject x="158" y={top + 9} width="300" height={rowHeight - 18}>
              <div
                style={{
                  color: c.ink,
                  fontSize: point.title.length > 20 ? 25 : 29,
                  fontWeight: 700,
                  lineHeight: 1.3,
                  overflowWrap: 'anywhere',
                }}
              >
                {point.title}
              </div>
            </foreignObject>
            <foreignObject x="488" y={top + 9} width="714" height={rowHeight - 18}>
              <div
                style={{
                  color: active ? c.ink : c.muted,
                  fontSize: point.detail.length > 52 ? 23 : 27,
                  lineHeight: 1.35,
                  overflowWrap: 'anywhere',
                }}
              >
                {point.detail}
              </div>
            </foreignObject>
          </g>
        );
      })}
    </svg>
  );
}
