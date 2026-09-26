import { Button, ButtonGroup, Empty } from '@douyinfe/semi-ui';
import { useEffect, useRef } from 'react';
import type { VideoResource } from '../../../../util/types';
import {
  cueAt,
  formatVideoTime,
  matchingCue,
  type TranscriptMode,
} from '../store/model/videoTranscript';
export function VideoTranscriptPanel({
  video,
  currentTime,
  mode,
  onChangeMode,
  onSeek,
}: {
  video: VideoResource;
  currentTime: number;
  mode: TranscriptMode;
  onChangeMode: (mode: TranscriptMode) => void;
  onSeek: (seconds: number) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const centeredContextRef = useRef('');
  const original = video.captions.original;
  const chinese = video.captions.chinese;
  const displayCues = mode === 'chinese' ? chinese : original;
  const activeCue = cueAt(displayCues, currentTime);

  useEffect(() => {
    const list = listRef.current;
    const active = list?.querySelector<HTMLElement>('.video-transcript-row--active');
    if (!list || !active) return undefined;

    const context = `${video.id}:${mode}`;
    const behavior = centeredContextRef.current === context ? 'smooth' : 'auto';
    centeredContextRef.current = context;
    const centerPadding = Math.max(
      6,
      (list.clientHeight - active.getBoundingClientRect().height) / 2,
    );
    list.style.setProperty('--video-transcript-center-padding', `${centerPadding}px`);
    const frame = window.requestAnimationFrame(() => {
      const listRect = list.getBoundingClientRect();
      const activeRect = active.getBoundingClientRect();
      const activeTop = activeRect.top - listRect.top + list.scrollTop;
      list.scrollTo({
        top: activeTop - (list.clientHeight - activeRect.height) / 2,
        behavior,
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeCue?.startSeconds, mode, video.id]);

  return (
    <div className="video-transcript-panel min-h-0 overflow-hidden">
      <div className="video-transcript-panel__modes [padding:8px_10px] [background:var(--semi-color-bg-1)]">
        <ButtonGroup aria-label="字幕语言">
          <Button
            disabled={!original.length}
            aria-pressed={mode === 'original'}
            theme={mode === 'original' ? 'solid' : 'borderless'}
            type={mode === 'original' ? 'primary' : 'tertiary'}
            onClick={() => onChangeMode('original')}
          >
            原文
          </Button>
          <Button
            disabled={!chinese.length}
            aria-pressed={mode === 'chinese'}
            theme={mode === 'chinese' ? 'solid' : 'borderless'}
            type={mode === 'chinese' ? 'primary' : 'tertiary'}
            onClick={() => onChangeMode('chinese')}
          >
            中文
          </Button>
          <Button
            disabled={!original.length || !chinese.length}
            aria-pressed={mode === 'bilingual'}
            theme={mode === 'bilingual' ? 'solid' : 'borderless'}
            type={mode === 'bilingual' ? 'primary' : 'tertiary'}
            onClick={() => onChangeMode('bilingual')}
          >
            双语
          </Button>
        </ButtonGroup>
      </div>
      <div
        ref={listRef}
        className="video-transcript-panel__list min-h-0 [padding:var(--video-transcript-center-padding,_6px)_8px]"
      >
        {displayCues.length ? (
          displayCues.map((cue) => {
            const active = activeCue?.startSeconds === cue.startSeconds;
            const translated =
              mode === 'bilingual' ? matchingCue(chinese, cue.startSeconds) : undefined;
            return (
              <button
                key={`${mode}:${cue.startSeconds}:${cue.text.slice(0, 12)}`}
                type="button"
                className={`video-transcript-row w-full [min-height:44px] [grid-template-columns:42px_minmax(0,_1fr)] [align-items:start] [gap:6px] [padding:7px_8px] [color:var(--semi-color-text-0)] [background:transparent] [text-align:left] mobile:[min-height:48px] mobile:[grid-template-columns:42px_minmax(0,_1fr)] mobile:[padding:8px] ${active ? ' video-transcript-row--active' : ''}`}
                onClick={() => onSeek(cue.startSeconds)}
              >
                <span className="video-transcript-row__time [color:var(--semi-color-text-2)]">
                  {formatVideoTime(cue.startSeconds)}
                </span>
                <span className="video-transcript-row__copy min-w-0 [gap:4px]">
                  <span>{cue.text}</span>
                  {translated?.text && (
                    <span className="video-transcript-row__translation [color:var(--semi-color-text-1)]">
                      {translated.text}
                    </span>
                  )}
                </span>
              </button>
            );
          })
        ) : (
          <Empty
            title="没有可用字幕"
            description={video.captions.error || '该视频没有提供当前语言的字幕'}
          />
        )}
      </div>
    </div>
  );
}
