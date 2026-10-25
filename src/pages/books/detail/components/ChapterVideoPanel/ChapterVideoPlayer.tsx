import { IconExpand } from '@douyinfe/semi-icons';
import { Button, Typography } from '@douyinfe/semi-ui';
import { useRef, useState } from 'react';
import type { ChapterVideo, MindMapSource } from '../../../../../../contracts/reading';
import { booksApi } from '../../../../../api/books';
import { videoTime } from './model';

export function ChapterVideoPlayer({
  video,
  onLocateSource,
}: {
  video: ChapterVideo;
  onLocateSource?: (source: MindMapSource) => Promise<void>;
}) {
  const player = useRef<HTMLVideoElement>(null);
  const [time, setTime] = useState(0);
  const [error, setError] = useState('');
  const [locating, setLocating] = useState(false);
  const current = video.scenes.reduce(
    (selected, item, index) => (time + 0.05 >= item.startSeconds ? index : selected),
    0,
  );
  const scene = video.scenes[Math.max(0, current)];
  const seek = (seconds: number) => {
    if (!player.current) return;
    player.current.currentTime = seconds;
    setTime(seconds);
    void player.current.play().catch(() => setError('请点击播放器的播放按钮继续观看'));
  };
  const fullscreen = () => {
    const element = player.current as
      (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
    if (!element) return;
    setError('');
    if (element.requestFullscreen)
      void element
        .requestFullscreen()
        .catch(() => setError('暂时无法全屏，请使用播放器内的全屏按钮'));
    else if (element.webkitEnterFullscreen) element.webkitEnterFullscreen();
    else setError('当前浏览器不支持全屏，请直接在播放器中观看');
    void element.play().catch(() => undefined);
  };
  const locate = async (source: MindMapSource) => {
    if (!onLocateSource || locating) return;
    setLocating(true);
    setError('');
    player.current?.pause();
    try {
      await onLocateSource(source);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '无法定位原文');
    } finally {
      setLocating(false);
    }
  };
  return (
    <section className="flex min-w-0 flex-col gap-3" aria-label="视频讲解">
      <div className="min-w-0">
        <Typography.Text strong>{video.title}</Typography.Text>
        <p className="mt-1 text-[13px] leading-normal [color:var(--semi-color-text-1)]">
          {video.summary}
        </p>
      </div>
      <video
        ref={player}
        className="aspect-video w-full rounded-[var(--semi-border-radius-medium)] [background:var(--semi-color-bg-0)]"
        src={booksApi.chapterVideoUrl(video.bookId, video.id)}
        poster={booksApi.chapterVideoUrl(video.bookId, video.id, true)}
        controls
        playsInline
        preload="metadata"
        aria-label={video.title}
        onTimeUpdate={() => setTime(player.current?.currentTime ?? 0)}
        onError={() => setError('视频加载失败，请重新打开面板或重新生成')}
        onKeyDown={(event) => event.stopPropagation()}
        onKeyUp={(event) => event.stopPropagation()}
      />
      <div className="chapter-video-actions flex flex-wrap items-center justify-between gap-3">
        <span className="text-[12px] tabular-nums [color:var(--semi-color-text-2)]">
          {videoTime(video.durationSeconds)} · {video.hasAudio ? 'AI 中文配音' : '字幕讲解'}
        </span>
        <Button
          aria-label="全屏播放"
          theme="borderless"
          type="tertiary"
          size="small"
          icon={<IconExpand />}
          onClick={fullscreen}
        >
          全屏播放
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-[13px] [color:var(--semi-color-danger)]">
          {error}
        </p>
      )}
      <Typography.Text strong>知识点</Typography.Text>
      <div className="flex min-w-0 flex-col gap-1" aria-label="视频知识点时间线">
        {video.scenes.map((item, index) => (
          <button
            key={`${video.id}:${index}`}
            type="button"
            aria-current={index === current ? 'step' : undefined}
            aria-label={`播放 ${item.title}`}
            className={`flex min-h-[44px] min-w-0 items-center gap-3 rounded-[var(--semi-border-radius-small)] border-0 px-2 py-3 text-left [font:inherit] touch-manipulation hover:[background:var(--semi-color-fill-0)] focus-visible:outline-2 focus-visible:[outline-color:var(--semi-color-focus-border)] ${index === current ? '[background:var(--semi-color-primary-light-default)] [color:var(--semi-color-primary)]' : 'bg-transparent [color:var(--semi-color-text-1)]'}`}
            onClick={() => seek(item.startSeconds)}
          >
            <span className="shrink-0 text-[12px] tabular-nums">
              {videoTime(item.startSeconds)}
            </span>
            <span className="min-w-0 truncate text-[13px]">{item.title}</span>
          </button>
        ))}
      </div>
      {scene && (
        <div className="min-w-0 border-t border-solid [border-color:var(--semi-color-border)] pt-3">
          <p className="text-[13px] leading-[1.65] [color:var(--semi-color-text-1)]">
            {scene.narration}
          </p>
          {onLocateSource && (
            <div className="chapter-video-actions mt-2 flex flex-wrap gap-4">
              {scene.sources.map((source, index) => (
                <Button
                  key={`${source.passageId}:${index}`}
                  size="small"
                  theme="borderless"
                  type="tertiary"
                  disabled={locating}
                  onClick={() => void locate(source)}
                >
                  查看原文{scene.sources.length > 1 ? ` ${index + 1}` : ''}
                </Button>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
