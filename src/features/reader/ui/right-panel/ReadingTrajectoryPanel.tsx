import { useMemo } from 'react';
import { Empty, Tooltip, Typography } from '@douyinfe/semi-ui';
import { useLearningStore } from '../../../../store/useLearningStore';
import { dateKey, formatDuration } from '../../model/rightPanelModel';

const { Text } = Typography;

export function ReadingTrajectoryPanel({ bookId }: { bookId: string }) {
  const allSessions = useLearningStore((state) => state.readingSessions);
  const sessions = useMemo(
    () =>
      allSessions
        .filter((session) => session.bookId === bookId && session.durationMs > 0)
        .sort((a, b) => b.startedAt - a.startedAt),
    [allSessions, bookId],
  );
  const dailyHistory = useMemo(() => {
    const groups = new Map<
      string,
      {
        key: string;
        startedAt: number;
        endedAt: number;
        durationMs: number;
        sessionCount: number;
      }
    >();
    sessions.forEach((session) => {
      const key = dateKey(session.startedAt);
      const current = groups.get(key);
      groups.set(
        key,
        current
          ? {
              ...current,
              startedAt: Math.min(current.startedAt, session.startedAt),
              endedAt: Math.max(current.endedAt, session.endedAt),
              durationMs: current.durationMs + session.durationMs,
              sessionCount: current.sessionCount + 1,
            }
          : {
              key,
              startedAt: session.startedAt,
              endedAt: session.endedAt,
              durationMs: session.durationMs,
              sessionCount: 1,
            },
      );
    });
    return Array.from(groups.values()).sort((left, right) => right.startedAt - left.startedAt);
  }, [sessions]);
  const total = sessions.reduce((sum, session) => sum + session.durationMs, 0);
  const heatmap = useMemo(() => {
    const totals = new Map(dailyHistory.map((day) => [day.key, day.durationMs]));
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Array.from({ length: 84 }, (_, index) => {
      const date = new Date(today);
      date.setDate(today.getDate() - (83 - index));
      const durationMs = totals.get(dateKey(date.getTime())) ?? 0;
      const minutes = durationMs / 60_000;
      const level = minutes === 0 ? 0 : minutes < 15 ? 1 : minutes < 30 ? 2 : minutes < 60 ? 3 : 4;
      return { key: dateKey(date.getTime()), date, durationMs, level };
    });
  }, [dailyHistory]);

  return (
    <div className="right-panel__body trajectory-panel">
      <section className="trajectory-section">
        <div className="trajectory-section__heading">
          <Text strong>最近 12 周</Text>
          <Text size="small" type="tertiary">
            阅读热力图
          </Text>
        </div>
        <div className="reading-heatmap" aria-label="最近 12 周阅读热力图">
          {heatmap.map((day) => (
            <Tooltip
              key={day.key}
              content={`${day.date.toLocaleDateString('zh-CN')} · ${formatDuration(day.durationMs)}`}
            >
              <span
                className={`reading-heatmap__cell reading-heatmap__cell--${day.level}`}
                aria-label={`${day.key} ${formatDuration(day.durationMs)}`}
              />
            </Tooltip>
          ))}
        </div>
        <div className="heatmap-legend" aria-hidden="true">
          <span>少</span>
          {[0, 1, 2, 3, 4].map((level) => (
            <i key={level} className={`reading-heatmap__cell reading-heatmap__cell--${level}`} />
          ))}
          <span>多</span>
        </div>
      </section>

      <section className="reading-total-card">
        <Text size="small" type="tertiary">
          累计阅读时间
        </Text>
        <strong>{formatDuration(total)}</strong>
        <Text size="small" type="tertiary">
          共阅读 {dailyHistory.length} 天 · {sessions.length} 次
        </Text>
      </section>

      <section className="trajectory-section trajectory-history">
        <div className="trajectory-section__heading">
          <Text strong>阅读历史</Text>
        </div>
        {dailyHistory.length ? (
          dailyHistory.slice(0, 30).map((day) => (
            <div className="reading-history-item" key={day.key}>
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
