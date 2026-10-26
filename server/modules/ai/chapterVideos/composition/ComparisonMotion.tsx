import { useCurrentFrame, useVideoConfig } from 'remotion';
import type { ChapterVideoScene } from '../../../../../contracts/reading.js';
import { videoColors as c } from './palette.js';
import { sceneTiming } from './sceneTiming.js';

export function ComparisonMotion({ scene }: { scene: ChapterVideoScene }) {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const timing = sceneTiming(scene, frame / fps, durationInFrames / fps);
  const table = scene.visual?.comparison;
  if (!table) return null;
  const rowHeight = table.rows.length === 4 ? 81 : 106;
  return (
    <svg
      width="1280"
      height="430"
      viewBox="0 0 1280 430"
      style={{ position: 'absolute', top: 180 }}
    >
      {[
        { text: table.left, x: 320, color: c.demand },
        { text: table.right, x: 790, color: c.supply },
      ].map((header) => (
        <foreignObject key={header.x} x={header.x} y="0" width="410" height="64">
          <div
            style={{
              color: header.color,
              fontSize: header.text.length > 12 ? 27 : 33,
              lineHeight: 1.15,
              fontWeight: 700,
              overflowWrap: 'anywhere',
            }}
          >
            {header.text}
          </div>
        </foreignObject>
      ))}
      <line x1="76" x2="1204" y1="66" y2="66" stroke={c.ink} strokeWidth="2" />
      {table.rows.map((row, index) => {
        const top = 76 + index * rowHeight;
        return (
          <g key={row.label}>
            {timing.point === index && (
              <rect x="64" y={top} width="1152" height={rowHeight} fill={c.highlight} />
            )}
            {[
              { text: row.label, x: 76, width: 210, color: c.muted },
              { text: row.left, x: 320, width: 410, color: c.ink },
              { text: row.right, x: 790, width: 410, color: c.ink },
            ].map((cell) => (
              <foreignObject
                key={cell.x}
                x={cell.x}
                y={top + 8}
                width={cell.width}
                height={rowHeight - 12}
              >
                <div
                  style={{
                    fontSize: cell.x === 76 ? 24 : table.rows.length === 4 ? 26 : 29,
                    lineHeight: 1.3,
                    color: cell.color,
                    overflowWrap: 'anywhere',
                  }}
                >
                  {cell.text}
                </div>
              </foreignObject>
            ))}
            <line x1="76" x2="1204" y1={top + rowHeight} y2={top + rowHeight} stroke={c.line} />
          </g>
        );
      })}
    </svg>
  );
}
