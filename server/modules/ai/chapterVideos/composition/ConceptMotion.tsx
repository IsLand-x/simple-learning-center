import { useCurrentFrame, useVideoConfig } from 'remotion';
import type { ChapterVideoScene } from '../../../../../contracts/reading.js';
import { videoColors as c } from './palette.js';
import { sceneTiming } from './sceneTiming.js';

export function ConceptMotion({ scene }: { scene: ChapterVideoScene }) {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const timing = sceneTiming(scene, frame / fps, durationInFrames / fps);
  const connected = Boolean(scene.visual?.connections?.length);
  const nodeWidth = connected ? (1128 - (scene.points.length - 1) * 40) / scene.points.length : 540;
  const nodeHeight = connected ? 310 : scene.points.length > 2 ? 192 : 264;
  const positions = scene.points.map((_, index) => ({
    x: connected
      ? 76 + index * (nodeWidth + 40)
      : scene.points.length === 3 && index === 2
        ? 370
        : 76 + (index % 2) * 588,
    y: connected ? 48 : scene.points.length > 2 ? 18 + Math.floor(index / 2) * 204 : 72,
  }));
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
        const from = positions[edge.from];
        const to = positions[edge.to];
        const adjacent = edge.to === edge.from + 1;
        const centerY = from.y + nodeHeight / 2;
        const startX = adjacent ? from.x + nodeWidth : from.x + nodeWidth / 2;
        const endX = adjacent ? to.x - 5 : to.x + nodeWidth / 2;
        const lane = 18 + index * 5;
        const path = adjacent
          ? `M${startX} ${centerY}H${endX}`
          : `M${startX} ${from.y}V${lane}H${endX}V${to.y - 5}`;
        return (
          <g
            key={index}
            opacity={Math.min(timing.pointProgress(edge.from), timing.pointProgress(edge.to))}
          >
            <path
              d={path}
              fill="none"
              stroke={c.trade}
              strokeWidth="2.5"
              markerEnd="url(#relation-arrow)"
            />
            <foreignObject x={(startX + endX) / 2 - 100} y={365} width="200" height="52">
              <div
                style={{
                  color: c.trade,
                  fontSize: 18,
                  lineHeight: 1.2,
                  textAlign: 'center',
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
        const { x, y } = positions[index];
        const compact = connected && scene.points.length >= 3;
        const titleHeight = connected ? 104 : scene.points.length > 2 ? 64 : 80;
        return (
          <g key={index} opacity={timing.pointProgress(index)}>
            <rect
              x={x}
              y={y}
              width={nodeWidth}
              height={nodeHeight}
              rx="6"
              fill={active ? c.highlight : c.light}
              stroke={active ? c.trade : c.line}
              strokeWidth={active ? 2 : 1}
            />
            <rect
              x={x + 18}
              y={y + 18}
              width="28"
              height="4"
              rx="2"
              fill={active ? c.trade : c.demand}
            />
            <foreignObject x={x + 18} y={y + 32} width={nodeWidth - 36} height={titleHeight}>
              <div
                style={{
                  color: c.ink,
                  fontSize: compact || scene.points.length > 2 ? 26 : 30,
                  fontWeight: 700,
                  lineHeight: 1.2,
                  overflowWrap: 'anywhere',
                }}
              >
                {point.title}
              </div>
            </foreignObject>
            <foreignObject
              x={x + 18}
              y={y + 32 + titleHeight}
              width={nodeWidth - 36}
              height={nodeHeight - titleHeight - 44}
            >
              <div
                style={{
                  color: active ? c.ink : c.muted,
                  fontSize:
                    connected && scene.points.length === 4
                      ? 20
                      : compact || scene.points.length > 2
                        ? 22
                        : 26,
                  lineHeight: 1.25,
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
