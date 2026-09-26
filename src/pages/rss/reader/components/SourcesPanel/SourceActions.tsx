import {
  IconCheckList,
  IconExport,
  IconFolderOpen,
  IconImport,
  IconMore,
  IconRefresh,
} from '@douyinfe/semi-icons';
import { Button, Dropdown } from '@douyinfe/semi-ui';
import { useLearningStore } from '../../../../../store/useLearningStore';
import { useWorkspace } from '../../store/WorkspaceContext';
import { exportOpml } from './rssOpml';

export function SourceActions() {
  const persistedFeeds = useLearningStore((state) => state.rssFeeds);
  const persistedFolders = useLearningStore((state) => state.rssFolders);
  const { sources } = useWorkspace();

  const markRssItemsRead = useLearningStore((state) => state.markRssItemsRead);
  const feeds = persistedFeeds;
  const folders = persistedFolders;
  const visible = sources.sourceActionsVisible;
  const onExport = exportOpml;
  const onImport: () => void = () => sources.opmlInputRef.current?.click();
  const onManage: () => void = () => sources.setManageVisible(true);
  const onMarkAllRead: () => void = () => markRssItemsRead();
  const onRefreshAll: () => void = () => void sources.refreshFeeds(persistedFeeds);
  const onVisibleChange = sources.setSourceActionsVisible;

  return (
    <Dropdown
      trigger="click"
      visible={visible}
      onVisibleChange={onVisibleChange}
      render={
        <Dropdown.Menu>
          <Dropdown.Item
            icon={<IconRefresh />}
            onClick={() => {
              onVisibleChange(false);
              onRefreshAll();
            }}
          >
            刷新全部订阅
          </Dropdown.Item>
          <Dropdown.Item
            icon={<IconCheckList />}
            onClick={() => {
              onVisibleChange(false);
              onMarkAllRead();
            }}
          >
            全部标为已读
          </Dropdown.Item>
          <Dropdown.Item
            icon={<IconFolderOpen />}
            onClick={() => {
              onVisibleChange(false);
              onManage();
            }}
          >
            管理订阅源
          </Dropdown.Item>
          <Dropdown.Divider />
          <Dropdown.Item
            icon={<IconImport />}
            onClick={() => {
              onVisibleChange(false);
              onImport();
            }}
          >
            导入 OPML
          </Dropdown.Item>
          <Dropdown.Item
            icon={<IconExport />}
            onClick={() => {
              onVisibleChange(false);
              onExport(feeds, folders);
            }}
          >
            导出 OPML
          </Dropdown.Item>
        </Dropdown.Menu>
      }
    >
      <Button
        aria-label="更多 RSS 操作"
        icon={<IconMore />}
        size="small"
        theme="borderless"
        type="tertiary"
      />
    </Dropdown>
  );
}
