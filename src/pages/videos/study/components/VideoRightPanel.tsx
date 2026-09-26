import { IconAIStrokedLevel1, IconLanguage } from '@douyinfe/semi-icons';
import { Typography } from '@douyinfe/semi-ui';
import { VideoAiPanel } from '../../../../components/ai/ContentConversationPanel';
import type { VideoResource } from '../../../../util/types';
import { type TranscriptMode, type VideoPanel } from '../store/model/videoTranscript';
import { VideoTranscriptPanel } from './VideoTranscriptPanel';
const { Text } = Typography;
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
      className={`right-panel w-full min-h-0 overflow-hidden [background:var(--semi-color-bg-1)] min-w-0 [max-width:none] video-right-panel${panel === 'ai' ? ' right-panel--ai' : ''}`}
      aria-label={title}
    >
      <div className="panel-titlebar [height:var(--reader-bar-height)] [min-height:var(--reader-bar-height)] justify-between [padding:0_8px_0_12px]">
        <div className="panel-titlebar__title min-w-0 [color:var(--semi-color-text-1)]">
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
