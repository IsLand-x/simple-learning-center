import { IconPlus } from '@douyinfe/semi-icons';
import { Button, Tooltip, Typography } from '@douyinfe/semi-ui';
import { useWorkspace } from '../../store/WorkspaceContext';
import { SourceActions } from './SourceActions';
import { SourceTree } from './SourceTree';

const { Text } = Typography;
export function SourcesPanel() {
  const { sources } = useWorkspace();

  return (
    <section
      className="rss-source-pane w-full min-w-0 min-h-0 overflow-hidden [background:var(--semi-color-bg-0)]"
      aria-label="订阅源"
    >
      <div className="rss-panel-header [min-height:44px] [flex:0_0_44px] [padding:0_10px_0_12px] [background:var(--semi-color-bg-1)]">
        <Text strong>订阅源</Text>
        <SourceActions />
        <Tooltip content="添加订阅源">
          <Button
            aria-label="添加订阅源"
            icon={<IconPlus />}
            size="small"
            theme="borderless"
            type="tertiary"
            onClick={() => sources.setAddVisible(true)}
          />
        </Tooltip>
      </div>
      <SourceTree />
    </section>
  );
}
