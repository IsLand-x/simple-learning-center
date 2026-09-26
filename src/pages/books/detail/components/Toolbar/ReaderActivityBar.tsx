import type { RightPanel } from '../../../../../types/reader';
import type { ReaderActivityBarProps } from '../ReaderPanel/model';
import { ActivityButton } from './ActivityButton';

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
