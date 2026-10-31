import { Button, Tooltip } from '@douyinfe/semi-ui';
import type { RightPanel } from '../../../../../types/reader';
import { readerAiActivityLabel } from '../AssistantPanel/activity';
import { ReaderAiActivityIcon } from '../AssistantPanel/ReaderAiActivityIcon';
import { useReaderAiActivity } from '../AssistantPanel/useReaderAiActivity';
import { activityLabel, panelMeta } from '../ReaderPanel/model';

export function ActivityButton({
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
  const fullAriaLabel = statusLabel ? `${ariaLabel}，${statusLabel}` : ariaLabel;
  const icon =
    panel === 'ai' ? (
      <ReaderAiActivityIcon className="panel-tool-icon" />
    ) : (
      <PanelIcon className="panel-tool-icon" />
    );
  return (
    <Tooltip
      className="activity-button__tooltip pointer-events-none"
      content={statusLabel || tooltip}
      position="left"
    >
      <Button
        aria-label={fullAriaLabel}
        aria-pressed={active}
        className={`activity-button [width:44px] [min-width:44px] [height:44px] [min-height:44px] justify-center [padding:3px] [background:transparent] ${active ? ' activity-button--active' : ''}`}
        icon={icon}
        size="small"
        theme="borderless"
        type="tertiary"
        onClick={onClick}
      >
        {activityLabel(panel)}
      </Button>
    </Tooltip>
  );
}
