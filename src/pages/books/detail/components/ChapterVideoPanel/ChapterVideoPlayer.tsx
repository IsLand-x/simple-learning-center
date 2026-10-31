import { IconChevronLeft, IconChevronRight, IconExpand, IconMore } from '@douyinfe/semi-icons';
import { Button, Dropdown, Select, Tooltip } from '@douyinfe/semi-ui';
import { useEffect, useId, useState } from 'react';
import type { ChapterVideo } from '../../../../../../contracts/reading';
import { booksApi } from '../../../../../api/books';
import { videoTime } from './model';
import type { useChapterVideoPlayback } from './useChapterVideoPlayback';
import { useChapterVideoPopup } from './useChapterVideoPopup';

export function ChapterVideoPlayer({
  video,
  mobile,
  playback,
  part,
  total,
  regenerateDisabled,
  removeDisabled,
  canPrevious,
  canNext,
  onPrevious,
  onNext,
  onEnded,
  onRegenerate,
  onRemove,
}: {
  video: ChapterVideo;
  mobile: boolean;
  playback: ReturnType<typeof useChapterVideoPlayback>;
  part: number;
  total: number;
  regenerateDisabled: boolean;
  removeDisabled: boolean;
  canPrevious: boolean;
  canNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onEnded: () => void;
  onRegenerate: () => void;
  onRemove: () => void;
}) {
  const popup = useChapterVideoPopup(mobile, video.id);
  const speedLabelId = useId();
  const [localFallback, setLocalFallback] = useState(false);

  useEffect(() => {
    setLocalFallback(false);
  }, [video.id, video.cosUrl]);

  const usingCos = Boolean(video.cosUrl && !localFallback);
  const videoSrc = usingCos ? video.cosUrl! : booksApi.chapterVideoUrl(video.bookId, video.id);
  const posterSrc =
    !localFallback && video.posterCosUrl
      ? video.posterCosUrl
      : booksApi.chapterVideoUrl(video.bookId, video.id, true);

  return (
    <section className="shrink-0 min-w-0 px-3 pb-2" aria-label="视频讲解">
      <video
        ref={playback.player}
        className="block aspect-video max-h-[32dvh] w-full rounded-[var(--semi-border-radius-medium)] [background:var(--semi-color-bg-0)]"
        src={videoSrc}
        poster={posterSrc}
        controls
        playsInline
        preload="metadata"
        aria-label={video.title}
        onTimeUpdate={() => playback.setTime(playback.player.current?.currentTime ?? 0)}
        onLoadedMetadata={() => {
          if (playback.player.current) playback.player.current.playbackRate = playback.rate;
        }}
        onEnded={onEnded}
        onError={() => {
          if (usingCos) {
            setLocalFallback(true);
            return;
          }
          playback.setError('视频加载失败，请重新打开面板或重新生成');
        }}
        onKeyDown={(event) => event.stopPropagation()}
        onKeyUp={(event) => event.stopPropagation()}
      />
      <div className="mt-2 flex min-w-0 items-start gap-2">
        <span className="shrink-0 text-[12px] leading-[1.5] tabular-nums [color:var(--semi-color-primary)]">
          P{part}
        </span>
        <p className="m-0 min-w-0 flex-1 truncate text-[13px] font-semibold" title={video.title}>
          {video.title}
        </p>
      </div>
      <div className="chapter-video-actions mt-1 flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <span className="text-[12px] tabular-nums [color:var(--semi-color-text-2)]">
          {part}/{total} P · {videoTime(video.durationSeconds)} ·{' '}
          {video.hasAudio ? 'AI 配音' : '字幕'}
          {usingCos ? ' · COS 云端' : ''}
        </span>
        <div className="flex min-w-0 items-center gap-5">
          <span id={speedLabelId} className="sr-only">
            视频播放速度
          </span>
          <Select
            ref={popup.speedRef}
            aria-labelledby={speedLabelId}
            className="chapter-video-rate"
            value={playback.rate}
            size="small"
            onDropdownVisibleChange={(visible) => popup.change('speed', visible)}
            optionList={[0.8, 1, 1.15, 1.25, 1.5, 2].map((rate) => ({
              value: rate,
              label: `${rate}×`,
            }))}
            onChange={(rate) => {
              if (typeof rate === 'number') playback.setRate(rate);
            }}
          />
          <Tooltip content="上一 P">
            <Button
              size="small"
              theme="borderless"
              type="tertiary"
              aria-label="上一 P"
              disabled={!canPrevious}
              icon={<IconChevronLeft />}
              onClick={onPrevious}
            />
          </Tooltip>
          <Tooltip content="下一 P">
            <Button
              size="small"
              theme="borderless"
              type="tertiary"
              aria-label="下一 P"
              disabled={!canNext}
              icon={<IconChevronRight />}
              onClick={onNext}
            />
          </Tooltip>
          <Tooltip content="全屏播放">
            <Button
              size="small"
              theme="borderless"
              type="tertiary"
              aria-label="全屏播放"
              icon={<IconExpand />}
              onClick={playback.fullscreen}
            />
          </Tooltip>
          <Dropdown
            trigger="click"
            position="bottomRight"
            visible={popup.actionsVisible}
            onVisibleChange={(visible) => popup.change('actions', visible)}
            render={
              <Dropdown.Menu>
                <Dropdown.Item disabled={regenerateDisabled} onClick={onRegenerate}>
                  重新生成此 P
                </Dropdown.Item>
                <Dropdown.Item type="danger" disabled={removeDisabled} onClick={onRemove}>
                  删除此 P
                </Dropdown.Item>
              </Dropdown.Menu>
            }
          >
            <Button
              size="small"
              theme="borderless"
              type="tertiary"
              aria-label="视频操作"
              icon={<IconMore />}
            />
          </Dropdown>
        </div>
      </div>
      {playback.error && (
        <p role="alert" className="mt-1 text-[12px] [color:var(--semi-color-danger)]">
          {playback.error}
        </p>
      )}
    </section>
  );
}
