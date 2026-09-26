import { IconDelete, IconExternalOpen } from '@douyinfe/semi-icons';
import { Button, Tooltip, Typography } from '@douyinfe/semi-ui';
import { type RefObject } from 'react';
import { MarkdownNoteEditor } from '../../../../components/notes/MarkdownNoteEditor';
import type { NoteItem, VideoResource } from '../../../../types/domain';
import { formatVideoTime } from '../store/model/videoTranscript';
import { YouTubePlayer, type YouTubePlayerHandle } from './YouTubePlayer';
const { Text } = Typography;
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
    <section
      className="video-main-pane w-full min-w-0 min-h-0 overflow-hidden [background:var(--semi-color-bg-0)] mobile:[min-height:100%] mobile:[overflow:visible]"
      aria-label="视频学习区"
    >
      <div className="video-detail-toolbar [min-height:44px] [flex:0_0_44px] [padding:0_8px_0_12px] [background:var(--semi-color-bg-1)]">
        <div className="video-detail-toolbar__identity justify-center [gap:1px] [line-height:1.25]">
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
      <div className="video-learning-stage w-full min-h-0 overflow-hidden mobile:[min-height:100%] mobile:[overflow:visible]">
        <YouTubePlayer
          key={video.id}
          ref={playerRef}
          videoId={video.youtubeVideoId}
          initialTime={video.lastPositionSeconds}
          onTimeUpdate={onChangeCurrentTime}
        />
        <section
          className="video-main-editor w-full [min-height:180px] [flex:0_1_32%] overflow-hidden [border-top:1px_solid_var(--semi-color-border)] [background:var(--semi-color-bg-0)] mobile:[height:300px] mobile:[min-height:240px]"
          aria-label="视频学习笔记"
        >
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
