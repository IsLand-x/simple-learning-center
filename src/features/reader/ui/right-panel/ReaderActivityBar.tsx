import { Button } from '@douyinfe/semi-ui';
import { ActivityRailButton } from '../../../../components/ActivityRailButton';
import type { RightPanel } from '../../../../types';
import {
  activityLabel,
  mobilePanelItems,
  panelMeta,
  type MobileReaderPanel,
  type ReaderActivityBarProps,
} from '../../model/rightPanelModel';

export function ReaderMobilePanelTabs({
  activePanel,
  onChangePanel,
}: {
  activePanel: MobileReaderPanel;
  onChangePanel: (panel: MobileReaderPanel) => void;
}) {
  return (
    <nav className="mobile-panel-tabs" aria-label="切换更多功能">
      {mobilePanelItems.map(({ panel, label, ariaLabel, Icon }) => (
        <Button
          aria-label={ariaLabel}
          aria-pressed={activePanel === panel}
          className={activePanel === panel ? 'mobile-panel-tabs__button--active' : ''}
          icon={<Icon />}
          key={panel}
          size="small"
          theme="borderless"
          type="tertiary"
          onClick={() => onChangePanel(panel)}
        >
          {label}
        </Button>
      ))}
    </nav>
  );
}

function ActivityButton({
  panel,
  activePanel,
  onClick,
}: {
  panel: Exclude<RightPanel, null>;
  activePanel: RightPanel;
  onClick: () => void;
}) {
  const active = panel === activePanel;
  const meta = panelMeta[panel];
  const PanelIcon = meta.Icon;
  const tooltip =
    panel === 'ai'
      ? active
        ? '收起 AI 助手'
        : '打开 AI 助手'
      : active
        ? `收起${meta.label}`
        : `打开${meta.label}`;
  const ariaLabel =
    panel === 'ai'
      ? active
        ? '收起 AI 助手'
        : '打开 AI 助手并继续当前对话'
      : active
        ? `收起${meta.label}`
        : `打开${meta.label}`;
  return (
    <ActivityRailButton
      active={active}
      ariaLabel={ariaLabel}
      icon={<PanelIcon className="panel-tool-icon" />}
      label={activityLabel(panel)}
      tooltip={tooltip}
      onClick={onClick}
    />
  );
}

export function ReaderActivityBar({ activePanel, onChangePanel }: ReaderActivityBarProps) {
  const toggle = (panel: Exclude<RightPanel, null>) =>
    onChangePanel(activePanel === panel ? null : panel);
  return (
    <nav className="activity-bar" aria-label="阅读辅助工具">
      <ActivityButton panel="ai" activePanel={activePanel} onClick={() => toggle('ai')} />
      <ActivityButton panel="history" activePanel={activePanel} onClick={() => toggle('history')} />
      <ActivityButton panel="notes" activePanel={activePanel} onClick={() => toggle('notes')} />
      <ActivityButton
        panel="comments"
        activePanel={activePanel}
        onClick={() => toggle('comments')}
      />
      <ActivityButton
        panel="highlights"
        activePanel={activePanel}
        onClick={() => toggle('highlights')}
      />
      <ActivityButton
        panel="trajectory"
        activePanel={activePanel}
        onClick={() => toggle('trajectory')}
      />
    </nav>
  );
}
