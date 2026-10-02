import { Button } from '@douyinfe/semi-ui';
import { readerAiActivityLabel } from '../AssistantPanel/activity';
import { ReaderAiActivityIcon } from '../AssistantPanel/ReaderAiActivityIcon';
import { useReaderAiActivity } from '../AssistantPanel/useReaderAiActivity';
import { mobilePanelItems, type MobileReaderPanel } from '../ReaderPanel/model';

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
