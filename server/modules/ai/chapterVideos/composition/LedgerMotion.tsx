import { useCurrentFrame, useVideoConfig } from 'remotion';
import type { ChapterVideoScene } from '../../../../../contracts/reading.js';
import { videoColors as c } from './palette.js';
import { sceneTiming } from './sceneTiming.js';
import { tradeExample } from './tradeModel.js';

export function LedgerMotion({ scene }: { scene: ChapterVideoScene }) {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const timing = sceneTiming(scene, frame / fps, durationInFrames / fps);
  const mode = scene.visual?.mode === 'closed' ? 'import' : (scene.visual?.mode ?? 'import');
  const model = tradeExample(mode);
  const rows = [
    { label: '消费者', value: model.consumerChange, color: c.demand },
    { label: '生产者', value: model.producerChange, color: c.supply },
    ...(model.policy
      ? [
          {
            label: mode === 'quota' ? '本国持证人' : '政府',
            value: model.transfer,
            color: c.revenue,
          },
        ]
      : []),
    { label: '净变化', value: model.netChange, color: model.netChange < 0 ? c.loss : c.trade },
  ];
  const rowHeight = rows.length === 4 ? 80 : 103;
  const sign = (value: number) => `${value > 0 ? '+' : ''}${Number(value.toFixed(1))}`;
  const priceChange = Math.abs(model.after.price - model.before.price);
  const calculations = [
    `消费者剩余${model.consumerChange < 0 ? '减少' : '增加'}：（${model.before.demand}＋${model.after.demand}）× 价差 ${priceChange} ÷ 2 ＝ ${Math.abs(model.consumerChange)}`,
    `生产者剩余${model.producerChange < 0 ? '减少' : '增加'}：（${model.before.supply}＋${model.after.supply}）× 价差 ${priceChange} ÷ 2 ＝ ${Math.abs(model.producerChange)}`,
    ...(model.policy
      ? [
          `${mode === 'quota' ? '许可证租金' : '政府收入'}：价差 ${priceChange} × 进口量 ${model.after.imports} ＝ ${model.transfer}`,
        ]
      : []),
    `${sign(model.consumerChange)} ${sign(model.producerChange)}${model.policy ? ` ＋${model.transfer}` : ''} ＝ ${sign(model.netChange)}${model.policy ? '；两项净损失各为 10 × 1 ÷ 2 ＝ 5' : ''}`,
  ];
  return (
    <svg
      width="1280"
      height="430"
      viewBox="0 0 1280 430"
      style={{ position: 'absolute', top: 180 }}
    >
      <text x="76" y="24" fill={c.muted} fontSize="24">
        {model.policy ? '相对自由进口的福利变化' : '相对封闭市场的福利变化'} · 教学金额单位
      </text>
      <line
        x1="650"
        x2="650"
        y1="42"
        y2={52 + rows.length * rowHeight}
        stroke={c.line}
        strokeWidth="2"
      />
      {rows.map((row, index) => {
        const top = 54 + index * rowHeight;
        const final = index === rows.length - 1;
        const active = timing.point === index || (final && timing.beat?.focus === 'conclusion');
        const beat = scene.beats?.find(
          (item) => item.pointIndex === index || (final && item.focus === 'conclusion'),
        );
        const reveal = Math.max(
          0,
          Math.min(1, (frame / fps - (beat?.startSeconds ?? index * 0.6)) / 0.65),
        );
        const width = Math.abs(row.value) * 3.7 * reveal;
        return (
          <g key={row.label} opacity={active || final ? 1 : 0.65}>
            {final && (
              <rect
                x="64"
                y={top - 6}
                width="1152"
                height={rowHeight - 8}
                rx="5"
                fill={c.highlight}
              />
            )}
            <text
              x="88"
              y={top + 39}
              fill={c.ink}
              fontSize="34"
              fontWeight={active || final ? 700 : 500}
            >
              {row.label}
            </text>
            <rect
              x={row.value < 0 ? 650 - width : 650}
              y={top + 12}
              width={width}
              height="34"
              rx="2"
              fill={row.color}
            />
            <text
              x="1148"
              y={top + 43}
              textAnchor="end"
              fill={row.color}
              fontSize="46"
              fontWeight="700"
              opacity={reveal}
            >
              {sign(row.value)}
            </text>
            {active && !final && (
              <line
                x1="88"
                x2="210"
                y1={top + 54}
                y2={top + 54}
                stroke={row.color}
                strokeWidth="3"
              />
            )}
          </g>
        );
      })}
      <foreignObject x="76" y="388" width="1128" height="48">
        <div style={{ color: c.muted, fontSize: 19, lineHeight: 1.25 }}>
          {calculations[timing.point] ?? calculations.at(-1)}
          {mode === 'quota' && '；租金留在本国，拍卖或外国人持证时需重算归属。'}
        </div>
      </foreignObject>
    </svg>
  );
}
