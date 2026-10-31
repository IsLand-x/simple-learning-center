import { IconPlay } from '@douyinfe/semi-icons';
import { Empty, Switch } from '@douyinfe/semi-ui';
import type { ChapterVideo } from '../../../../../../contracts/reading';
import { videoTime } from './model';

export function ChapterVideoPlaylist({
  videos,
  selectedId,
  continuous,
  onContinuousChange,
  onSelect,
}: {
  videos: ChapterVideo[];
  selectedId?: string;
  continuous: boolean;
  onContinuousChange: (value: boolean) => void;
  onSelect: (video: ChapterVideo) => void;
}) {
  return (
    <section aria-label="已生成的视频" className="min-w-0 p-3">
      <div className="mb-2 flex min-h-[44px] items-center justify-between gap-3">
        <span className="text-[12px] [color:var(--semi-color-text-2)]">
          按书内顺序 · 共 {videos.length} P
        </span>
        <label className="flex min-h-[44px] items-center gap-2 text-[12px] [color:var(--semi-color-text-1)]">
          自动连播
          <Switch
            size="small"
            aria-label="自动连播下一 P"
            checked={continuous}
            onChange={onContinuousChange}
          />
        </label>
      </div>
      {videos.length ? (
        videos.map((video, index) => (
          <button
            key={video.id}
            type="button"
            aria-label={`观看 P${index + 1} ${video.chapterTitle}`}
            aria-current={selectedId === video.id ? 'true' : undefined}
            onClick={() => onSelect(video)}
            className={`mb-1 flex min-h-[56px] w-full min-w-0 items-center gap-3 rounded-[var(--semi-border-radius-small)] border-0 border-l-[3px] border-solid px-2 py-2 text-left [font:inherit] touch-manipulation hover:[background:var(--semi-color-fill-0)] focus-visible:outline-2 focus-visible:[outline-color:var(--semi-color-focus-border)] ${selectedId === video.id ? '[border-left-color:var(--semi-color-primary)] [background:var(--semi-color-primary-light-default)] [color:var(--semi-color-primary)]' : 'border-l-transparent bg-transparent [color:var(--semi-color-text-1)]'}`}
          >
            <span className="w-6 shrink-0 text-[12px] tabular-nums">P{index + 1}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px]">{video.chapterTitle}</span>
              <span className="mt-1 block truncate text-[11px] [color:var(--semi-color-text-2)]">
                {video.scenes.length} 段讲解 · {video.hasAudio ? '中文配音' : '字幕讲解'}
                {video.cosUrl ? ' · COS 云端' : ''}
              </span>
            </span>
            {selectedId === video.id && <IconPlay aria-hidden />}
            <span className="shrink-0 text-[12px] tabular-nums">
              {videoTime(video.durationSeconds)}
            </span>
          </button>
        ))
      ) : (
        <Empty
          className="py-6"
          title="还没有可播放的分 P"
          description="选择章节，手动生成第一集。"
        />
      )}
    </section>
  );
}
