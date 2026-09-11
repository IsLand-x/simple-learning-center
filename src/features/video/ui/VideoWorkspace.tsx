import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { Button, ButtonGroup, Empty, Tooltip, Typography } from '@douyinfe/semi-ui';
import {
  IconAIStrokedLevel1,
  IconDelete,
  IconExternalOpen,
  IconLanguage,
  IconPlus,
} from '@douyinfe/semi-icons';
import { ActivityRailButton } from '../../../components/ActivityRailButton';
import { MarkdownNoteEditor } from '../../../components/MarkdownNoteEditor';
import { VideoAiPanel } from '../../../components/RssAiPanel';
import { YouTubePlayer, type YouTubePlayerHandle } from '../../../components/YouTubePlayer';
import type { NoteItem, VideoResource } from '../../../types';
import {
  cueAt,
  formatVideoTime,
  matchingCue,
  type TranscriptMode,
  type VideoPanel,
} from '../model/videoTranscript';

const { Text } = Typography;

export function VideoLibrary({
  videos,
  selectedVideoId,
  onAdd,
  onSelect,
}: {
  videos: VideoResource[];
  selectedVideoId?: string;
  onAdd: () => void;
  onSelect: (video: VideoResource) => void;
}) {
  const groups = useMemo(() => {
    const result = new Map<string, VideoResource[]>();
    for (const video of videos) {
      const key = video.channelTitle || '未知频道';
      result.set(key, [...(result.get(key) ?? []), video]);
    }
    return [...result.entries()];
  }, [videos]);

  return (
    <section className="video-library" aria-label="视频资料">
      <div className="video-panel-header">
        <Text strong>视频资料</Text>
        <Tooltip content="添加视频">
          <Button
            aria-label="添加 YouTube 视频"
            icon={<IconPlus />}
            size="small"
            theme="borderless"
            type="tertiary"
            onClick={onAdd}
          />
        </Tooltip>
      </div>
      <div className="video-library__list">
        {groups.length ? (
          groups.map(([channel, channelVideos]) => (
            <section key={channel} className="video-channel-group">
              <Text
                className="video-channel-group__title"
                size="small"
                type="tertiary"
                ellipsis={{ showTooltip: true }}
              >
                {channel}
              </Text>
              {channelVideos.map((video) => (
                <button
                  key={video.id}
                  type="button"
                  aria-current={video.id === selectedVideoId ? 'page' : undefined}
                  className={`video-resource-row${video.id === selectedVideoId ? ' video-resource-row--active' : ''}`}
                  onClick={() => onSelect(video)}
                >
                  <span className="video-resource-row__title">{video.title}</span>
                  <span className="video-resource-row__meta">
                    {formatVideoTime(video.durationSeconds)}
                  </span>
                </button>
              ))}
            </section>
          ))
        ) : (
          <Empty title="还没有视频资料" description="点击右上角加号，粘贴 YouTube 链接开始学习" />
        )}
      </div>
    </section>
  );
}

function VideoTranscriptPanel({
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
    <div className="video-transcript-panel">
      <div className="video-transcript-panel__modes">
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
      <div ref={listRef} className="video-transcript-panel__list">
        {displayCues.length ? (
          displayCues.map((cue) => {
            const active = activeCue?.startSeconds === cue.startSeconds;
            const translated =
              mode === 'bilingual' ? matchingCue(chinese, cue.startSeconds) : undefined;
            return (
              <button
                key={`${mode}:${cue.startSeconds}:${cue.text.slice(0, 12)}`}
                type="button"
                className={`video-transcript-row${active ? ' video-transcript-row--active' : ''}`}
                onClick={() => onSeek(cue.startSeconds)}
              >
                <span className="video-transcript-row__time">
                  {formatVideoTime(cue.startSeconds)}
                </span>
                <span className="video-transcript-row__copy">
                  <span>{cue.text}</span>
                  {translated?.text && (
                    <span className="video-transcript-row__translation">{translated.text}</span>
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

export function VideoRightPanel({
  panel,
  video,
  currentTime,
  transcriptMode,
  onChangeTranscriptMode,
  onSeek,
}: {
  panel: VideoPanel;
  video: VideoResource;
  currentTime: number;
  transcriptMode: TranscriptMode;
  onChangeTranscriptMode: (mode: TranscriptMode) => void;
  onSeek: (seconds: number) => void;
}) {
  const title = panel === 'transcript' ? '对话稿' : 'AI 助手';
  const PanelIcon = panel === 'transcript' ? IconLanguage : IconAIStrokedLevel1;
  return (
    <aside
      className={`right-panel video-right-panel${panel === 'ai' ? ' right-panel--ai' : ''}`}
      aria-label={title}
    >
      <div className="panel-titlebar">
        <div className="panel-titlebar__title">
          <PanelIcon size="large" className="panel-tool-icon" />
          <Text strong>{title}</Text>
        </div>
      </div>
      {panel === 'transcript' ? (
        <VideoTranscriptPanel
          video={video}
          currentTime={currentTime}
          mode={transcriptMode}
          onChangeMode={onChangeTranscriptMode}
          onSeek={onSeek}
        />
      ) : (
        <VideoAiPanel video={video} />
      )}
    </aside>
  );
}

export function VideoActivityBar({
  panel,
  onChange,
}: {
  panel: VideoPanel | null;
  onChange: (panel: VideoPanel) => void;
}) {
  return (
    <nav className="activity-bar video-activity-bar" aria-label="视频学习辅助功能">
      <ActivityRailButton
        active={panel === 'transcript'}
        ariaLabel="打开对话稿"
        icon={<IconLanguage />}
        label="字幕"
        tooltip="查看对话稿"
        onClick={() => onChange('transcript')}
      />
      <ActivityRailButton
        active={panel === 'ai'}
        ariaLabel="打开 AI 助手"
        icon={<IconAIStrokedLevel1 />}
        label="AI"
        tooltip="打开 AI 助手"
        onClick={() => onChange('ai')}
      />
    </nav>
  );
}

export function VideoMainContent({
  video,
  studyNote,
  playerRef,
  onChangeCurrentTime,
  onChangeStudyNote,
  onDeleteVideo,
}: {
  video: VideoResource;
  studyNote?: NoteItem;
  playerRef: RefObject<YouTubePlayerHandle>;
  onChangeCurrentTime: (seconds: number) => void;
  onChangeStudyNote: (content: string) => void;
  onDeleteVideo: () => void;
}) {
  return (
    <section className="video-main-pane" aria-label="视频学习区">
      <div className="video-detail-toolbar">
        <div className="video-detail-toolbar__identity">
          <Text strong ellipsis={{ showTooltip: true }}>
            {video.title}
          </Text>
          <Text size="small" type="tertiary">
            {video.channelTitle} · {formatVideoTime(video.durationSeconds)}
          </Text>
        </div>
        <Tooltip content="在 YouTube 打开">
          <Button
            aria-label="在 YouTube 新窗口打开"
            icon={<IconExternalOpen />}
            size="small"
            theme="borderless"
            type="tertiary"
            onClick={() => window.open(video.url, '_blank', 'noopener,noreferrer')}
          />
        </Tooltip>
        <Tooltip content="删除视频资料">
          <Button
            aria-label="删除视频资料"
            icon={<IconDelete />}
            size="small"
            theme="borderless"
            type="danger"
            onClick={onDeleteVideo}
          />
        </Tooltip>
      </div>
      <div className="video-learning-stage">
        <YouTubePlayer
          key={video.id}
          ref={playerRef}
          videoId={video.youtubeVideoId}
          initialTime={video.lastPositionSeconds}
          onTimeUpdate={onChangeCurrentTime}
        />
        <section className="video-main-editor" aria-label="视频学习笔记">
          <MarkdownNoteEditor
            ariaLabel="视频学习笔记"
            content={studyNote?.content ?? ''}
            onChange={onChangeStudyNote}
          />
        </section>
      </div>
    </section>
  );
}
