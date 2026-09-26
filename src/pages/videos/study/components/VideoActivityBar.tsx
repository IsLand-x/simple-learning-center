import { IconAIStrokedLevel1, IconLanguage } from '@douyinfe/semi-icons';
import { ActivityRailButton } from '../../../../components/layout/ActivityRailButton';
import { type VideoPanel } from '../store/model/videoTranscript';
export function VideoActivityBar({
  panel,
  onChange,
}: {
  panel: VideoPanel | null;
  onChange: (panel: VideoPanel) => void;
}) {
  return (
    <nav
      className="activity-bar [width:52px] [min-width:52px] [gap:4px] [padding:4px] [border-left:1px_solid_var(--semi-color-border)] [background:var(--semi-color-bg-1)] video-activity-bar"
      aria-label="视频学习辅助功能"
    >
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
