import { Button, Dropdown } from '@douyinfe/semi-ui';
import {
  IconCheckList,
  IconExport,
  IconFolderOpen,
  IconImport,
  IconMore,
  IconRefresh,
} from '@douyinfe/semi-icons';
import type { RssFeed, RssFolder } from '../../../../util/types';

export function RssSourceActions({
  feeds,
  folders,
  visible,
  onExport,
  onImport,
  onManage,
  onMarkAllRead,
  onRefreshAll,
  onVisibleChange,
}: {
  feeds: RssFeed[];
  folders: RssFolder[];
  visible: boolean;
  onExport: (feeds: RssFeed[], folders: RssFolder[]) => void;
  onImport: () => void;
  onManage: () => void;
  onMarkAllRead: () => void;
  onRefreshAll: () => void;
  onVisibleChange: (visible: boolean) => void;
}) {
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
