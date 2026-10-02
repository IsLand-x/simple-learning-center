import { IconAIStrokedLevel1, IconCalendarClock, IconComment } from '@douyinfe/semi-icons';
import { ActivityRailButton } from '../../../../../components/layout/ActivityRailButton';
import { type RssSidePanel } from '../../store/navigation';

export function RssActivityRail({
  activePanel,
  onChange,
}: {
  activePanel: RssSidePanel;
  onChange: (panel: Exclude<RssSidePanel, null>) => void;
}) {
  return (
    <nav
      className="activity-bar [width:52px] [min-width:52px] [gap:4px] [padding:4px] [border-left:1px_solid_var(--semi-color-border)] [background:var(--semi-color-bg-1)]"
      aria-label="RSS 辅助功能"
    >
      <ActivityRailButton
        active={activePanel === 'ai'}
        ariaLabel={activePanel === 'ai' ? '收起 AI 助手' : '打开 AI 助手'}
        icon={<IconAIStrokedLevel1 className="panel-tool-icon" />}
        label="AI"
        tooltip={activePanel === 'ai' ? '收起 AI 助手' : '打开 AI 助手'}
        onClick={() => onChange('ai')}
      />
      <ActivityRailButton
        active={activePanel === 'timeline'}
        ariaLabel={activePanel === 'timeline' ? '收起时间线' : '打开时间线'}
        icon={<IconCalendarClock className="panel-tool-icon" />}
        label="时间线"
        tooltip={activePanel === 'timeline' ? '收起时间线' : '打开时间线'}
        onClick={() => onChange('timeline')}
      />
      <ActivityRailButton
        active={activePanel === 'comments'}
        ariaLabel={activePanel === 'comments' ? '收起评论' : '打开评论'}
        icon={<IconComment className="panel-tool-icon" />}
        label="评论"
        tooltip={activePanel === 'comments' ? '收起评论' : '打开评论'}
        onClick={() => onChange('comments')}
      />
    </nav>
  );
}
