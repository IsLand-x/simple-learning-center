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
        const passed = index < timing.point;
        const top = 28 + index * rowHeight;
        const stepNumber = String(index + 1).padStart(2, '0');
        return (
          <g key={index} opacity={active ? 1 : passed ? 0.88 : 0.58}>
            <rect
              x="124"
              y={top}
              width="1090"
              height={rowHeight - 8}
              rx="6"
              fill={active ? c.highlight : c.light}
              stroke={active ? c.trade : c.line}
              strokeWidth={active ? 2 : 1}
            />
            <rect
              x="124"
              y={top}
              width="6"
              height={rowHeight - 8}
              rx="3"
              fill={active ? c.trade : passed ? c.demand : c.line}
            />
            <foreignObject x="146" y={top + 10} width="46" height={rowHeight - 20}>
              <div
                style={{
                  color: active ? c.trade : c.muted,
                  fontSize: 20,
                  fontWeight: 700,
                  fontFamily: 'monospace',
                  lineHeight: 1.4,
                }}
              >
                {stepNumber}
              </div>
            </foreignObject>
            <foreignObject x="196" y={top + 9} width="280" height={rowHeight - 18}>
              <div
                style={{
                  color: c.ink,
                  fontSize: point.title.length > 20 ? 24 : 28,
                  fontWeight: 700,
                  lineHeight: 1.3,
                  overflowWrap: 'anywhere',
                }}
              >
                {point.title}
              </div>
            </foreignObject>
            <foreignObject x="492" y={top + 9} width="706" height={rowHeight - 18}>
              <div
                style={{
                  color: active ? c.ink : c.muted,
                  fontSize: point.detail.length > 52 ? 22 : 26,
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
