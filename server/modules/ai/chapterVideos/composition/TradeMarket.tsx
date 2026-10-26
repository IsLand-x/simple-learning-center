import { useCurrentFrame, useVideoConfig } from 'remotion';
import type { ChapterVideoScene } from '../../../../../contracts/reading.js';
import { videoColors as c } from './palette.js';
import { sceneTiming } from './sceneTiming.js';
import { tradeExample } from './tradeModel.js';

export function TradeMarket({ scene }: { scene: ChapterVideoScene }) {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const mode = scene.visual?.mode ?? 'closed';
  const timing = sceneTiming(scene, frame / fps, durationInFrames / fps);
  const model = tradeExample(mode, timing.progress('price', 0.16));
  const { before, after, worldPrice, policy } = model;
  const numeric = scene.visual?.example === 'linear-trade';
  const quantities = timing.progress('quantities', 0.35);
  const revenue = timing.progress('revenue', 0.58);
  const loss = timing.progress('loss', 0.73);
  const welfare = timing.progress('welfare', 0.72);
  const accountingBeat = scene.beats?.find((beat) =>
    ['welfare', 'revenue', 'loss'].includes(beat.focus),
  );
  const accounting =
    numeric && Boolean(accountingBeat && frame / fps >= accountingBeat.startSeconds);
  const x = (quantity: number) => 100 + quantity * 8.4;
  const y = (price: number) => 345 - price * 28;
  const number = (value: number) => Number(value.toFixed(1)).toString();
  const delta = (value: number) => `${value >= 0 ? '+' : ''}${number(value)}`;
  const left = Math.min(after.supply, after.demand);
  const right = Math.max(after.supply, after.demand);
  return (
    <svg
      width="1280"
      height="430"
      viewBox="0 0 1280 430"
      style={{ position: 'absolute', top: 175 }}
    >
      <text x="100" y="24" fill={c.muted} fontSize="21">
        {numeric ? '单价（教学元）' : '价格'}
      </text>
      {[2, 4, 6, 8, 10].map((price) => (
        <g key={price}>
          <line x1="100" x2="772" y1={y(price)} y2={y(price)} stroke={c.line} strokeWidth="1" />
          {numeric && (
            <text x="80" y={y(price) + 8} textAnchor="end" fill={c.muted} fontSize="23">
              {price}
            </text>
          )}
        </g>
      ))}
      <path d="M100 50V345H800" fill="none" stroke={c.ink} strokeWidth="2" />
      {[0, 20, 40, 60, 80].map((quantity) => (
        <g key={quantity}>
          <line x1={x(quantity)} x2={x(quantity)} y1="345" y2="351" stroke={c.muted} />
          {numeric && (
            <text x={x(quantity)} y="380" textAnchor="middle" fill={c.muted} fontSize="23">
              {quantity}
            </text>
          )}
        </g>
      ))}
      <text x="782" y="410" fill={c.muted} fontSize="21" textAnchor="end">
        {numeric ? '数量（教学单位）' : '数量'}
      </text>
      <path
        d={`M${x(0)} ${y(2)}L${x(80)} ${y(10)}`}
        fill="none"
        stroke={c.supply}
        strokeWidth="5"
      />
      <path
        d={`M${x(0)} ${y(10)}L${x(80)} ${y(2)}`}
        fill="none"
        stroke={c.demand}
        strokeWidth="5"
      />
      <text x="790" y="63" fill={c.supply} fontSize="26">
        供给 S
      </text>
      <text x="790" y="300" fill={c.demand} fontSize="26">
        需求 D
      </text>
      <line
        x1="100"
        x2="772"
        y1={y(before.price)}
        y2={y(before.price)}
        stroke={c.muted}
        strokeDasharray="5 7"
        opacity=".5"
      />
      {mode !== 'closed' && (
        <line
          x1="100"
          x2="772"
          y1={y(worldPrice)}
          y2={y(worldPrice)}
          stroke={c.trade}
          strokeDasharray="8 7"
          strokeWidth="2"
        />
      )}
      {!numeric && !policy && (
        <text x="82" y={y(before.price) + 7} textAnchor="end" fill={c.muted} fontSize="21">
          P₀
        </text>
      )}
      {mode !== 'closed' && (
        <text
          x={numeric ? 110 : 82}
          y={y(worldPrice) - (numeric ? 9 : -7)}
          textAnchor={numeric ? 'start' : 'end'}
          fill={c.trade}
          fontSize="21"
        >
          {numeric ? `Pw = ${worldPrice}` : 'Pw'}
        </text>
      )}
      {!policy && (
        <g opacity={welfare}>
          <path
            d={`M${x(0)} ${y(10)}L${x(0)} ${y(after.price)}L${x(after.demand)} ${y(after.price)}Z`}
            fill={c.demand}
            opacity=".16"
          />
          <path
            d={`M${x(0)} ${y(2)}L${x(0)} ${y(after.price)}L${x(after.supply)} ${y(after.price)}Z`}
            fill={c.supply}
            opacity=".16"
          />
        </g>
      )}
      {policy && (
        <>
          <rect
            x={x(after.supply)}
            y={y(after.price)}
            width={Math.max(0, x(after.demand) - x(after.supply))}
            height={y(worldPrice) - y(after.price)}
            fill={c.revenue}
            opacity={revenue * 0.28}
          />
          <path
            d={`M${x(before.supply)} ${y(worldPrice)}L${x(after.supply)} ${y(after.price)}L${x(after.supply)} ${y(worldPrice)}Z M${x(before.demand)} ${y(worldPrice)}L${x(after.demand)} ${y(after.price)}L${x(after.demand)} ${y(worldPrice)}Z`}
            fill={c.loss}
            opacity={loss * 0.65}
          />
          <text
            x={x(40)}
            y={y((after.price + worldPrice) / 2) + 8}
            textAnchor="middle"
            fill={c.revenue}
            fontSize="23"
            opacity={revenue}
          >
            {mode === 'quota' ? '许可证租金' : '政府收入'}
            {numeric ? ` ${number(model.transfer)}` : ''}
          </text>
          <text
            x={x(before.supply) - 10}
            y={y(worldPrice) + 45}
            textAnchor="end"
            fill={c.loss}
            fontSize="24"
            opacity={loss}
          >
            {numeric ? `损失 ${number(model.productionLoss)}` : '过度生产损失'}
          </text>
          <text
            x={x(before.demand) + 10}
            y={y(worldPrice) + 45}
            fill={c.loss}
            fontSize="24"
            opacity={loss}
          >
            {numeric ? `损失 ${number(model.consumptionLoss)}` : '消费不足损失'}
          </text>
        </>
      )}
      <line
        x1="100"
        x2="772"
        y1={y(after.price)}
        y2={y(after.price)}
        stroke={policy ? c.revenue : c.ink}
        strokeWidth="3"
      />
      {[after.supply, after.demand].map((quantity, index) => (
        <g key={index}>
          <line
            x1={x(quantity)}
            x2={x(quantity)}
            y1={y(after.price)}
            y2="345"
            stroke={index ? c.demand : c.supply}
            strokeDasharray="4 6"
            opacity={0.3 + quantities * 0.7}
          />
          <circle cx={x(quantity)} cy={y(after.price)} r="7" fill={index ? c.demand : c.supply} />
          {(mode !== 'closed' || index === 0) && (
            <text
              x={x(quantity) + (index ? 14 : -14)}
              y={y(after.price) + 32}
              textAnchor={index ? 'start' : 'end'}
              fill={index ? c.demand : c.supply}
              fontSize="25"
              opacity={quantities}
            >
              {numeric
                ? `${index ? 'Qd' : 'Qs'}=${number(quantity)}`
                : index
                  ? '国内需求'
                  : '国内供给'}
            </text>
          )}
        </g>
      ))}
      {mode !== 'closed' && (
        <g opacity={quantities}>
          <path
            d={`M${x(left)} ${y(after.price) - 38}v-9H${x(right)}v9`}
            fill="none"
            stroke={c.trade}
            strokeWidth="3"
          />
          <text
            x={x((left + right) / 2)}
            y={y(after.price) - 61}
            textAnchor="middle"
            fill={c.trade}
            fontSize="30"
            fontWeight="600"
          >
            {mode === 'export' ? '出口' : '进口'}
            {numeric ? ` ${number(right - left)}` : '量'}
          </text>
        </g>
      )}
      <g transform="translate(925 58)">
        <text fill={c.muted} fontSize="22">
          {mode === 'quota'
            ? numeric
              ? '进口上限为 20'
              : '限制进口数量'
            : policy
              ? numeric
                ? '每单位关税 1'
                : '加入进口关税'
              : mode === 'closed'
                ? '封闭市场'
                : '接入世界市场'}
        </text>
        <text y="55" fill={c.ink} fontSize="46" fontWeight="700">
          {numeric
            ? mode === 'closed'
              ? '均衡价 6 元'
              : `${number(before.price)} → ${number(after.price)} 元`
            : mode === 'export' || policy
              ? '国内价格上升'
              : mode === 'closed'
                ? '供需相交'
                : '国内价格下降'}
        </text>
        <text y="109" fill={c.supply} fontSize="27">
          {accounting
            ? `生产者${policy ? ` ${delta(model.producerChange)}` : `剩余 ${number(after.producerSurplus)}${mode === 'closed' ? '' : ` (${delta(model.producerChange)})`}`}`
            : '国内生产'}
          {!accounting &&
            (numeric
              ? ` ${number(after.supply)}`
              : mode === 'closed'
                ? ''
                : mode === 'export' || policy
                  ? ' ↑'
                  : ' ↓')}
        </text>
        <text y="155" fill={c.demand} fontSize="27">
          {accounting
            ? `消费者${policy ? ` ${delta(model.consumerChange)}` : `剩余 ${number(after.consumerSurplus)}${mode === 'closed' ? '' : ` (${delta(model.consumerChange)})`}`}`
            : '国内消费'}
          {!accounting &&
            (numeric
              ? ` ${number(after.demand)}`
              : mode === 'closed'
                ? ''
                : mode === 'export' || policy
                  ? ' ↓'
                  : ' ↑')}
        </text>
        <text
          y="219"
          fill={accounting && model.netChange < 0 ? c.loss : c.trade}
          fontSize="42"
          fontWeight="700"
        >
          {accounting
            ? policy
              ? timing.beat?.focus === 'loss' || timing.beat?.focus === 'conclusion'
                ? `净损失 ${number(-model.netChange)}`
                : `${mode === 'quota' ? '持证人' : '政府'} +${number(model.transfer)}`
              : `总剩余 ${number(after.consumerSurplus + after.producerSurplus)}`
            : mode === 'closed'
              ? numeric
                ? '均衡量 40'
                : '供给 = 需求'
              : `${mode === 'export' ? '出口' : '进口'}${numeric ? ` ${number(right - left)}` : '量变化'}`}
        </text>
        {policy && (
          <text y="276" fill={c.loss} fontSize="26" opacity={loss}>
            {numeric
              ? `净损失 ${number(model.productionLoss)} + ${number(model.consumptionLoss)} = ${number(-model.netChange)}`
              : '两种扭曲，形成净损失'}
          </text>
        )}
        {!policy && accounting && mode !== 'closed' && (
          <text y="276" fill={c.trade} fontSize="27">
            比封闭增加 {number(model.netChange)}
          </text>
        )}
      </g>
    </svg>
  );
}
