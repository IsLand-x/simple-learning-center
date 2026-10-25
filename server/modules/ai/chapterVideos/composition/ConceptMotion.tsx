import { useCurrentFrame, useVideoConfig, interpolate, Easing } from 'remotion';
import type { ChapterVideoScene } from '../../../../../contracts/reading.js';

export function ConceptMotion({ scene }: { scene: ChapterVideoScene }) {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const progress = frame / durationInFrames;
  const balance = scene.visual?.kind === 'balance';
  const reveal = (index: number) =>
    interpolate(progress, [0.08 + index * 0.17, 0.22 + index * 0.17], [0, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
      easing: Easing.bezier(0.22, 1, 0.36, 1),
    });
  return (
    <svg
      width="1280"
      height="410"
      viewBox="0 0 1280 410"
      style={{ position: 'absolute', top: 190, left: 0 }}
    >
      {!balance && (
        <path
          d="M150 185C350 80 530 300 700 185S1020 80 1130 185"
          fill="none"
          stroke="#3e6976"
          strokeWidth="3"
          pathLength="1"
          strokeDasharray="1"
          strokeDashoffset={1 - reveal(0)}
        />
      )}
      {scene.points.map((point, index) => {
        const p = reveal(index);
        const cx =
          scene.points.length === 2
            ? 360 + index * 560
            : 200 + index * (880 / (scene.points.length - 1));
        const dense = scene.points.length === 4;
        const cy = balance ? 70 + index * (dense ? 90 : 120) : 185;
        const color = ['#7fbfff', '#ffb178', '#5fe0b9', '#d2b2ff'][index];
        return (
          <g
            key={point.title}
            opacity={p}
            transform={`translate(${balance ? 170 : cx} ${cy + (1 - p) * 28})`}
          >
            {balance ? (
              <>
                <text fill="#d5dfe8" fontSize="29" y="-14">
                  {point.title.length > 12 ? `${point.title.slice(0, 12)}…` : point.title}
                </text>
                <rect
                  y="8"
                  width={p * (index === 0 ? 810 : index === 1 ? 490 : 320)}
                  height="24"
                  rx="12"
                  fill={color}
                />
                <text x={dense ? 400 : 0} y={dense ? -14 : 64} fill="#a4b6c6" fontSize="22">
                  {point.detail.length > 24 ? `${point.detail.slice(0, 24)}…` : point.detail}
                </text>
              </>
            ) : (
              <>
                <circle r={54 + p * 5} fill="#122d3d" stroke={color} strokeWidth="2" />
                <circle
                  r={70 + ((frame % 90) / 90) * 15}
                  fill="none"
                  stroke={color}
                  opacity={0.12 * (1 - (frame % 90) / 90)}
                />
                <text y="10" textAnchor="middle" fill={color} fontSize="32" fontWeight="600">
                  {String(index + 1).padStart(2, '0')}
                </text>
                <foreignObject x="-136" y="90" width="272" height="150">
                  <div style={{ textAlign: 'center', overflowWrap: 'anywhere' }}>
                    <div
                      style={{ color: '#f4f4ee', fontSize: 29, fontWeight: 600, lineHeight: 1.3 }}
                    >
                      {point.title}
                    </div>
                    <div style={{ color: '#a4b6c6', fontSize: 21, lineHeight: 1.5, marginTop: 10 }}>
                      {point.detail.slice(0, 24)}
                    </div>
                  </div>
                </foreignObject>
              </>
            )}
          </g>
        );
      })}
      {balance && (
        <text x="1120" y="403" textAnchor="end" fill="#70899d" fontSize="16">
          长度为定性示意，不代表统计数据
        </text>
      )}
    </svg>
  );
}
