import { Empty, Tooltip, Typography } from '@douyinfe/semi-ui';
import { formatDuration } from './model';
import { useReadingTrajectory } from './useReadingTrajectory';

const { Text } = Typography;

export function ReadingTrajectoryPanel({ bookId }: { bookId: string }) {
  const { sessions, dailyHistory, total, remaining, heatmap } = useReadingTrajectory(bookId);
  return (
    <div className="right-panel__body min-h-0 trajectory-panel">
      <section className="trajectory-section">
        <div className="trajectory-section__heading justify-between">
          <Text strong>最近 12 周</Text>
          <Text size="small" type="tertiary">
            阅读热力图
          </Text>
        </div>
        <div
          className="reading-heatmap [grid-auto-flow:column] [grid-auto-columns:minmax(9px,_1fr)] [grid-template-rows:repeat(7,_1fr)] [gap:4px]"
          aria-label="最近 12 周阅读热力图"
        >
          {heatmap.map((day) => (
            <Tooltip
              key={day.key}
              content={`${day.date.toLocaleDateString('zh-CN')} · ${formatDuration(day.durationMs)}`}
            >
              <span
                className={`reading-heatmap__cell block w-full [aspect-ratio:1] [background:var(--semi-color-fill-0)] reading-heatmap__cell--${day.level}`}
                aria-label={`${day.key} ${formatDuration(day.durationMs)}`}
              />
            </Tooltip>
          ))}
        </div>
        <div
          className="heatmap-legend justify-end [gap:4px] [color:var(--semi-color-text-2)]"
          aria-hidden="true"
        >
          <span>少</span>
          {[0, 1, 2, 3, 4].map((level) => (
            <i
              key={level}
              className={`reading-heatmap__cell block w-full [aspect-ratio:1] [background:var(--semi-color-fill-0)] reading-heatmap__cell--${level}`}
            />
          ))}
          <span>多</span>
        </div>
      </section>

      <section className="reading-total-card [gap:4px] [padding:14px] [background:var(--semi-color-fill-0)]">
        <Text size="small" type="tertiary">
          累计阅读时间
        </Text>
        <strong>{formatDuration(total)}</strong>
        <div className="reading-total-card__estimate [align-items:baseline] justify-between [gap:4px_12px] [margin-top:8px]">
          <Tooltip content="按累计阅读时间和当前进度估算剩余时间；跳读或重读会影响结果。至少阅读 1 分钟且进度达到 1% 后显示。">
            <Text size="small" type="tertiary">
              预计阅读时间
            </Text>
          </Tooltip>
          <Text>
            {remaining === null
              ? '待估算'
              : remaining === 0
                ? '已读完'
                : `还需约 ${formatDuration(remaining)}`}
          </Text>
        </div>
        <Text size="small" type="tertiary">
          共阅读 {dailyHistory.length} 天 · {sessions.length} 次
        </Text>
      </section>

      <section className="trajectory-section trajectory-history min-h-0">
        <div className="trajectory-section__heading justify-between">
          <Text strong>阅读历史</Text>
        </div>
        {dailyHistory.length ? (
          dailyHistory.slice(0, 30).map((day) => (
            <div
              className="reading-history-item [min-height:46px] justify-between [padding:7px_0]"
              key={day.key}
            >
              <span>
                <Text>
                  {new Date(day.startedAt).toLocaleDateString('zh-CN', {
                    month: 'short',
                    day: 'numeric',
                  })}
                </Text>
                <Text size="small" type="tertiary">
                  {new Date(day.startedAt).toLocaleTimeString('zh-CN', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                  {'–'}
                  {new Date(day.endedAt).toLocaleTimeString('zh-CN', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                  {' · '}
                  {day.sessionCount} 次
                </Text>
              </span>
              <Text strong>{formatDuration(day.durationMs)}</Text>
            </div>
          ))
        ) : (
          <Empty title="还没有阅读轨迹" description="打开书籍并开始阅读后会自动记录" />
        )}
      </section>
    </div>
  );
}
