import { interpolate, Easing, useCurrentFrame, useVideoConfig } from 'remotion';
import type { ChapterVideoScene } from '../../../../../contracts/reading.js';

export function TradeMarket({
  mode = 'closed',
  points,
}: {
  mode?: NonNullable<ChapterVideoScene['visual']>['mode'];
  points: ChapterVideoScene['points'];
}) {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const t = frame / durationInFrames;
  const ease = (a: number, b: number) =>
    interpolate(t, [a, b], [0, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
      easing: Easing.bezier(0.22, 1, 0.36, 1),
    });
  const reveal = ease(0.02, 0.18);
  const opening = ease(0.18, 0.53);
  const policy = mode === 'tariff' || mode === 'quota';
  const pw = mode === 'export' ? 0.7 : 0.3;
  const free = mode === 'closed' ? 0.5 : policy ? pw : 0.5 + (pw - 0.5) * opening;
  const price = free + (policy ? 0.14 * ease(0.18, 0.53) : 0);
  const qs = (price - 0.15) / 0.7;
  const qd = (0.85 - price) / 0.7;
  const x = (q: number) => 130 + q * 680;
  const y = (p: number) => 530 - p * 350;
  const left = Math.min(qs, qd),
    right = Math.max(qs, qd);
  const pulse = (frame % 100) / 100;
  return (
    <svg
      width="1280"
      height="440"
      viewBox="0 130 1280 490"
      style={{ position: 'absolute', top: 164, left: 0, overflow: 'visible' }}
    >
      <defs>
        <linearGradient id="gains" x2="0" y2="1">
          <stop stopColor="#5fe0b9" stopOpacity=".55" />
          <stop offset="1" stopColor="#5fe0b9" stopOpacity=".08" />
        </linearGradient>
      </defs>
      {[0.2, 0.4, 0.6, 0.8].map((p) => (
        <line key={p} x1={130} x2={810} y1={y(p)} y2={y(p)} stroke="#25374a" strokeWidth="1" />
      ))}
      <path d="M130 180V530H840" fill="none" stroke="#697b8c" strokeWidth="2" />
      <text x="76" y="172" fill="#c5d0db" fontSize="24">
        价格
      </text>
      <text x="822" y="570" fill="#c5d0db" fontSize="24">
        数量
      </text>
      <path
        d={`M${x(0.05)} ${y(0.185)}L${x(0.95)} ${y(0.815)}`}
        pathLength="1"
        strokeDasharray="1"
        strokeDashoffset={1 - reveal}
        stroke="#ffb178"
        strokeWidth="5"
        fill="none"
      />
      <path
        d={`M${x(0.05)} ${y(0.815)}L${x(0.95)} ${y(0.185)}`}
        pathLength="1"
        strokeDasharray="1"
        strokeDashoffset={1 - reveal}
        stroke="#7fbfff"
        strokeWidth="5"
        fill="none"
      />
      <text x={x(0.94)} y={y(0.82) - 14} fill="#ffb178" fontSize="25">
        供给 S
      </text>
      <text x={x(0.94)} y={y(0.19) + 30} fill="#7fbfff" fontSize="25">
        需求 D
      </text>
      <line
        x1="130"
        x2="810"
        y1={y(0.5)}
        y2={y(0.5)}
        stroke="#697b8c"
        strokeDasharray="5 8"
        opacity={1 - opening * 0.65}
      />
      <text x="70" y={y(0.5) + 8} fill="#a4b6c6" fontSize="23">
        P₀
      </text>
      {mode !== 'closed' && (
        <>
          <path
            d={`M${x(left)} ${y(price)}L${x(0.5)} ${y(0.5)}L${x(right)} ${y(price)}Z`}
            fill="url(#gains)"
            opacity={policy ? 0 : ease(0.55, 0.8)}
          />
          <line
            x1="130"
            x2={130 + 680 * opening}
            y1={y(pw)}
            y2={y(pw)}
            stroke="#5fe0b9"
            strokeDasharray="8 6"
            strokeWidth="2"
            opacity={opening}
          />
          <text x="63" y={y(pw) + 8} fill="#5fe0b9" fontSize="23" opacity={opening}>
            Pw
          </text>
        </>
      )}
      <line
        x1="130"
        x2={x(0.5) + 340 * reveal}
        y1={y(price)}
        y2={y(price)}
        stroke={policy ? '#ffd678' : '#d7f4ec'}
        strokeWidth="3"
      />
      {[qs, qd].map((q, i) => (
        <g key={i} opacity={reveal}>
          <line
            x1={x(q)}
            x2={x(q)}
            y1={y(price)}
            y2="530"
            stroke={i ? '#7fbfff' : '#ffb178'}
            strokeDasharray="5 6"
          />
          <circle cx={x(q)} cy={y(price)} r="7" fill={i ? '#7fbfff' : '#ffb178'} />
        </g>
      ))}
      {policy && (
        <g opacity={ease(0.65, 0.86)}>
          <rect
            x={x(qs)}
            y={y(price)}
            width={x(qd) - x(qs)}
            height={y(pw) - y(price)}
            fill="#ffd678"
            fillOpacity=".35"
          />
          <path
            d={`M${x((pw - 0.15) / 0.7)} ${y(pw)}L${x(qs)} ${y(price)}L${x(qs)} ${y(pw)}Z M${x((0.85 - pw) / 0.7)} ${y(pw)}L${x(qd)} ${y(price)}L${x(qd)} ${y(pw)}Z`}
            fill="#ff8278"
            fillOpacity=".7"
          />
          <text x={x(0.5)} y={y(price) + 37} textAnchor="middle" fill="#ffe9ac" fontSize="23">
            {mode === 'quota' ? '许可证租金' : '政府收入'}
          </text>
          <text x={x(qs) - 90} y={y(pw) + 30} fill="#ff9c93" fontSize="21">
            净损失
          </text>
        </g>
      )}
      <g opacity={mode === 'closed' ? 0 : opening}>
        <path
          d={`M${x(left)} 554v12H${x(right)}v-12`}
          fill="none"
          stroke="#5fe0b9"
          strokeWidth="3"
        />
        <circle cx={x(left) + (x(right) - x(left)) * pulse} cy="566" r="5" fill="#5fe0b9" />
        <text x={x(0.5)} y="598" textAnchor="middle" fill="#5fe0b9" fontSize="25">
          {mode === 'export' ? '出口量 = 国内供给 − 国内需求' : '进口量 = 国内需求 − 国内供给'}
        </text>
      </g>
      <g transform="translate(920 230)">
        <text fill="#5fe0b9" fontSize="21" letterSpacing="3">
          {mode === 'closed' ? '贸易开放前' : policy ? '加入政策变化' : '世界市场接入'}
        </text>
        {points.map((point, index) => (
          <g
            key={index}
            opacity={ease(0.1 + index * 0.23, 0.23 + index * 0.23)}
            transform={`translate(0 ${56 + index * (points.length === 4 ? 72 : 87) + (1 - ease(0.1 + index * 0.23, 0.23 + index * 0.23)) * 18})`}
          >
            <text fill="#f4f4ee" fontSize="29" fontWeight="600">
              {point.title.length > 10 ? `${point.title.slice(0, 10)}…` : point.title}
            </text>
            <text y="34" fill="#a4b6c6" fontSize="19">
              {point.detail.slice(0, 16)}
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
}
