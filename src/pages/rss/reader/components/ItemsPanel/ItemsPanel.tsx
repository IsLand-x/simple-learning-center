import { Typography } from '@douyinfe/semi-ui';
import { useLearningStore } from '../../../../../store/useLearningStore';
import { useWorkspace } from '../../store/WorkspaceContext';
import { ItemList } from './ItemList';
import { RssItemListHeaderActions } from './RssItemListHeaderActions';

const { Text } = Typography;
export function ItemsPanel() {
  const { tasks, navigation: workspace } = useWorkspace();

  const markRssItemsRead = useLearningStore((state) => state.markRssItemsRead);

  return (
    <section
      className="rss-items-pane w-full min-w-0 min-h-0 overflow-hidden [background:var(--semi-color-bg-0)]"
      aria-label="订阅内容列表"
    >
      <div className="rss-panel-header [min-height:44px] [flex:0_0_44px] [padding:0_10px_0_12px] [background:var(--semi-color-bg-1)]">
        <Text strong ellipsis={{ showTooltip: true }}>
          {workspace.selectedSourceTitle}
        </Text>
        <Text size="small" type="tertiary">
          {workspace.selectedFeedId === 'daily'
            ? `${workspace.digestList.length} 天`
            : `${workspace.filteredItems.length} 条`}
        </Text>
        <RssItemListHeaderActions
          daily={workspace.selectedFeedId === 'daily'}
          digestGenerating={tasks.digestGenerating}
          todayKey={workspace.todayKey}
          unreadItemIds={workspace.unreadVisibleItems.map((item) => item.id)}
          onGenerateDigest={(date) => void tasks.runDigest(date)}
          onMarkRead={markRssItemsRead}
          onOpenDigestSettings={() => workspace.setDigestSettingsVisible(true)}
        />
      </div>
      <ItemList />
    </section>
  );
}
