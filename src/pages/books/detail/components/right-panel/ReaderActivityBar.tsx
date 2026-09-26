import { ReaderAiActivityIcon } from '../ReaderAiActivityIcon';
import { useReaderAiActivity } from '../../store/hooks/useReaderAiActivity';
import { readerAiActivityLabel } from '../../store/model/readerAiActivity';
import { Button } from '@douyinfe/semi-ui';
import { ActivityRailButton } from '../../../../../components/layout/ActivityRailButton';
import type { RightPanel } from '../../../../../types/domain';
import {
  activityLabel,
  mobilePanelItems,
  panelMeta,
  type MobileReaderPanel,
  type ReaderActivityBarProps,
} from '../../store/model/rightPanelModel';

export function ReaderMobilePanelTabs({
  activePanel,
  onChangePanel,
}: {
  activePanel: MobileReaderPanel;
  onChangePanel: (panel: MobileReaderPanel) => void;
}) {
  const { status } = useReaderAiActivity();
  const statusLabel = readerAiActivityLabel(status);
  return (
    <nav
      className="mobile-panel-tabs mobile:[height:calc(53px_+_env(safe-area-inset-bottom))] mobile:[min-height:calc(53px_+_env(safe-area-inset-bottom))] mobile:[flex:0_0_auto] mobile:[gap:2px] mobile:[padding:4px_8px_calc(4px_+_env(safe-area-inset-bottom))] mobile:overflow-x-auto mobile:[overflow-y:hidden] mobile:[overscroll-behavior-x:contain] mobile:[overscroll-behavior-y:none] mobile:[border-top:1px_solid_var(--semi-color-border)] mobile:[background:var(--semi-color-bg-1)] mobile:[scrollbar-width:none] mobile:[touch-action:pan-x]"
      aria-label="切换更多功能"
    >
      {mobilePanelItems.map(({ panel, label, ariaLabel, Icon }) => (
        <Button
          aria-label={panel === 'ai' && statusLabel ? `${ariaLabel}，${statusLabel}` : ariaLabel}
          aria-pressed={activePanel === panel}
          className={activePanel === panel ? 'mobile-panel-tabs__button--active' : ''}
          icon={panel === 'ai' ? <ReaderAiActivityIcon /> : <Icon />}
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
  const { status } = useReaderAiActivity();
  const statusLabel = panel === 'ai' ? readerAiActivityLabel(status) : '';
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
      ariaLabel={statusLabel ? `${ariaLabel}，${statusLabel}` : ariaLabel}
      icon={
        panel === 'ai' ? (
          <ReaderAiActivityIcon className="panel-tool-icon" />
        ) : (
          <PanelIcon className="panel-tool-icon" />
        )
      }
      label={activityLabel(panel)}
      tooltip={statusLabel || tooltip}
      onClick={onClick}
    />
  );
}

export function ReaderActivityBar({ activePanel, onChangePanel }: ReaderActivityBarProps) {
  const toggle = (panel: Exclude<RightPanel, null>) =>
    onChangePanel(activePanel === panel ? null : panel);
  return (
    <nav
      className="activity-bar [width:52px] [min-width:52px] [gap:4px] [padding:4px] [border-left:1px_solid_var(--semi-color-border)] [background:var(--semi-color-bg-1)]"
      aria-label="阅读辅助工具"
    >
      <ActivityButton panel="ai" activePanel={activePanel} onClick={() => toggle('ai')} />
      <ActivityButton panel="history" activePanel={activePanel} onClick={() => toggle('history')} />
      <ActivityButton
        panel="resources"
        activePanel={activePanel}
        onClick={() => toggle('resources')}
      />
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
