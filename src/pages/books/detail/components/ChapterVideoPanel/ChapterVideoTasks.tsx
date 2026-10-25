import { Button, Spin, Typography } from '@douyinfe/semi-ui';
import { useState } from 'react';
import type { ChapterVideoJob } from '../../../../../../contracts/reading';

export function ChapterVideoTasks({
  jobs,
  onSelect,
  onCancel,
}: {
  jobs: ChapterVideoJob[];
  onSelect: (chapterId: string | undefined) => void;
  onCancel: (jobId: string) => Promise<void>;
}) {
  const [cancelling, setCancelling] = useState<string>();
  if (!jobs.length) return null;
  const running = jobs.filter((job) => job.status === 'queued' || job.status === 'running');
  const visible = [...running, ...jobs.filter((job) => !running.includes(job)).slice(0, 5)];
  return (
    <section
      aria-label="视频生成任务"
      className="flex min-w-0 flex-col gap-2 border-b border-solid [border-color:var(--semi-color-border)] p-3"
    >
      <Typography.Text strong>生成任务</Typography.Text>
      {visible.map((job) => {
        const active = job.status === 'queued' || job.status === 'running';
        return (
          <div
            key={job.id}
            className="min-w-0 rounded-[var(--semi-border-radius-small)] p-2 [background:var(--semi-color-bg-0)]"
          >
            <div className="chapter-video-actions flex min-w-0 items-center justify-between gap-3">
              <Button
                className="min-w-0"
                theme="borderless"
                type="tertiary"
                size="small"
                aria-label={`查看视频任务 ${job.chapterTitle}`}
                onClick={() => onSelect(job.chapterId)}
              >
                <span className="block min-w-0 truncate">{job.chapterTitle}</span>
              </Button>
              {active && (
                <Button
                  theme="borderless"
                  type="tertiary"
                  size="small"
                  disabled={Boolean(cancelling)}
                  loading={cancelling === job.id}
                  onClick={async () => {
                    setCancelling(job.id);
                    try {
                      await onCancel(job.id);
                    } finally {
                      setCancelling(undefined);
                    }
                  }}
                >
                  取消生成
                </Button>
              )}
            </div>
            <p
              role={job.status === 'failed' ? 'alert' : 'status'}
              className={`mt-2 flex min-w-0 items-center gap-2 break-words text-[12px] leading-normal ${job.status === 'failed' ? '[color:var(--semi-color-danger)]' : '[color:var(--semi-color-text-1)]'}`}
            >
              {active && <Spin size="small" />}
              <span className="min-w-0">
                {job.status === 'completed'
                  ? '视频已生成'
                  : job.status === 'cancelled'
                    ? '生成已取消，可以重新生成。'
                    : job.status === 'failed'
                      ? job.error || '视频生成失败，请重试'
                      : job.content || '生成任务已排队'}
              </span>
            </p>
          </div>
        );
      })}
      {running.length > 0 && (
        <p className="text-[12px] leading-normal [color:var(--semi-color-text-2)]">
          关闭面板后继续生成，返回可查看进度；应用服务重启会中断任务并保留记录。
        </p>
      )}
    </section>
  );
}
