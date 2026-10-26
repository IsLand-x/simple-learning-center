import { Button } from '@douyinfe/semi-ui';
import { useState } from 'react';
import type { ChapterVideo, MindMapSource } from '../../../../../../contracts/reading';
import { videoTime } from './model';

export function ChapterVideoTimeline({
  video,
  current,
  onSeek,
  onLocateSource,
}: {
  video: ChapterVideo;
  current: number;
  onSeek: (seconds: number) => void;
  onLocateSource?: (source: MindMapSource) => Promise<void>;
}) {
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState('');
  const scene = video.scenes[current];
  const locate = async (source: MindMapSource) => {
    if (!onLocateSource || locating) return;
    setLocating(true);
    setError('');
    try {
      await onLocateSource(source);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '无法定位原文');
    } finally {
      setLocating(false);
    }
  };
  return (
    <section className="min-w-0 p-3" aria-label="视频知识点时间线">
      <p className="mb-2 text-[12px] leading-normal [color:var(--semi-color-text-2)]">
        {video.summary}
      </p>
      {video.scenes.map((item, index) => (
        <button
          key={`${video.id}:${index}`}
          type="button"
          aria-current={index === current ? 'step' : undefined}
          aria-label={`播放 ${item.title}`}
          onClick={() => onSeek(item.startSeconds)}
          className={`mb-1 flex min-h-[44px] w-full min-w-0 items-center gap-3 rounded-[var(--semi-border-radius-small)] border-0 px-2 py-2 text-left [font:inherit] touch-manipulation hover:[background:var(--semi-color-fill-0)] focus-visible:outline-2 focus-visible:[outline-color:var(--semi-color-focus-border)] ${index === current ? '[background:var(--semi-color-primary-light-default)] [color:var(--semi-color-primary)]' : 'bg-transparent [color:var(--semi-color-text-1)]'}`}
        >
          <span className="shrink-0 text-[12px] tabular-nums">{videoTime(item.startSeconds)}</span>
          <span className="min-w-0 truncate text-[13px]">{item.title}</span>
        </button>
      ))}
      {scene && (
        <div className="mt-3 border-t border-solid [border-color:var(--semi-color-border)] pt-3">
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
      {error && (
        <p role="alert" className="mt-2 text-[12px] [color:var(--semi-color-danger)]">
          {error}
        </p>
      )}
    </section>
  );
}
