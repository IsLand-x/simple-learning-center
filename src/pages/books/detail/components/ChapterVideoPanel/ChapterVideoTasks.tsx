import { IconDelete, IconRefresh } from '@douyinfe/semi-icons';
import { Button, Empty, Spin, Tooltip } from '@douyinfe/semi-ui';
import { useState } from 'react';
import type { ChapterVideoJob } from '../../../../../../contracts/reading';
import { confirmDialog } from '../../../../../util/confirmDialog';

export function ChapterVideoTasks({
  jobs,
  ready,
  onSelect,
  onCancel,
  onRetry,
  onRemove,
}: {
  jobs: ChapterVideoJob[];
  ready: boolean;
  onSelect: (chapterId: string | undefined) => void;
  onCancel: (jobId: string) => Promise<void>;
  onRetry: (job: ChapterVideoJob) => Promise<void>;
  onRemove: (jobId: string) => Promise<void>;
}) {
  const [processing, setProcessing] = useState<string>();
  const active = (job: ChapterVideoJob) => job.status === 'queued' || job.status === 'running';
  const visible = [...jobs].sort(
    (left, right) =>
      Number(active(right)) - Number(active(left)) || right.createdAt - left.createdAt,
  );
  const run = async (job: ChapterVideoJob, action: () => Promise<void>) => {
    setProcessing(job.id);
    try {
      await action();
    } catch {
      /* The controller reports the request error in the panel. */
    } finally {
      setProcessing(undefined);
    }
  };
  const remove = (job: ChapterVideoJob) =>
    confirmDialog({
      title: '删除视频任务记录？',
      content: '只删除服务器中的这条任务记录，已生成的视频、书籍和配置都会保留。',
      okText: '删除记录',
      cancelText: '取消',
      onOk: () => run(job, () => onRemove(job.id)),
    });
  return (
    <section aria-label="视频生成任务" className="min-w-0 p-3">
      {jobs.length ? (
        <p className="mb-2 text-[12px] leading-normal [color:var(--semi-color-text-2)]">
          关闭面板后继续生成。重试使用当前模型与配音设置。
        </p>
      ) : (
        <Empty className="py-6" title="还没有生成任务" description="点击上方“生成视频”选择章节。" />
      )}
      {visible.map((job) => {
        const running = active(job);
        const retrying = !running && job.status !== 'completed';
        const sameScopeRunning = jobs.some(
          (other) => other.chapterId === job.chapterId && active(other),
        );
        return (
          <div
            key={job.id}
            className="border-b border-solid [border-color:var(--semi-color-border)] py-2"
            data-job-id={job.id}
          >
            <div className="chapter-video-actions flex min-w-0 items-center justify-between gap-4">
              <button
                type="button"
                aria-label={`查看视频任务 ${job.chapterTitle}`}
                onClick={() => onSelect(job.chapterId)}
                className="min-h-[44px] min-w-0 flex-1 truncate rounded-[var(--semi-border-radius-small)] border-0 bg-transparent px-0 text-left text-[13px] [font-family:inherit] [color:var(--semi-color-text-0)] touch-manipulation focus-visible:outline-2 focus-visible:[outline-color:var(--semi-color-focus-border)]"
              >
                {job.chapterTitle}
              </button>
              <div className="flex shrink-0 items-center gap-5">
                {running ? (
                  <Button
                    theme="borderless"
                    type="tertiary"
                    size="small"
                    disabled={Boolean(processing)}
                    loading={processing === job.id}
                    onClick={() => void run(job, () => onCancel(job.id))}
                  >
                    取消生成
                  </Button>
                ) : (
                  <>
                    {retrying && (
                      <Tooltip content="使用当前模型与配音设置重试">
                        <Button
                          theme="borderless"
                          size="small"
                          icon={<IconRefresh />}
                          aria-label={`重试任务 ${job.chapterTitle}`}
                          disabled={!ready || Boolean(processing) || sameScopeRunning}
                          loading={processing === job.id}
                          onClick={() => void run(job, () => onRetry(job))}
                        />
                      </Tooltip>
                    )}
                    <Tooltip content="删除任务记录">
                      <Button
                        theme="borderless"
                        type="danger"
                        size="small"
                        icon={<IconDelete />}
                        aria-label={`删除任务 ${job.chapterTitle}`}
                        disabled={Boolean(processing)}
                        onClick={() => remove(job)}
                      />
                    </Tooltip>
                  </>
                )}
              </div>
            </div>
            <p
              role={job.status === 'failed' ? 'alert' : 'status'}
              className={`mt-1 flex min-w-0 items-start gap-2 break-words text-[12px] leading-normal ${job.status === 'failed' ? '[color:var(--semi-color-danger)]' : '[color:var(--semi-color-text-1)]'}`}
            >
              {running && <Spin size="small" />}
              <span className="min-w-0">
                {job.status === 'completed'
                  ? '视频已生成'
                  : job.status === 'cancelled'
                    ? '已取消'
                    : job.status === 'failed'
                      ? job.error || '生成失败，请重试'
                      : job.content || '生成任务已排队'}
              </span>
            </p>
            <p className="mt-1 truncate text-[11px] [color:var(--semi-color-text-2)]">
              {job.model} ·{' '}
              {new Date(job.createdAt).toLocaleString('zh-CN', {
                month: 'numeric',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
          </div>
        );
      })}
    </section>
  );
}
