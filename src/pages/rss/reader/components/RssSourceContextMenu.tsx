import { createPortal } from 'react-dom';
import { Dropdown } from '@douyinfe/semi-ui';
import {
  IconCheckList,
  IconDeleteStroked,
  IconFolderOpen,
  IconRefresh,
} from '@douyinfe/semi-icons';
import type { RssFeed, RssItem } from '../../../../types/domain';
import type { RssSourceMenuState } from '../store/menuTypes';

export function RssSourceContextMenu({
  items,
  menu,
  onClose,
  onDelete,
  onManage,
  onMarkRead,
  onRefresh,
}: {
  items: RssItem[];
  menu: RssSourceMenuState | null;
  onClose: () => void;
  onDelete: (feed: RssFeed) => void;
  onManage: () => void;
  onMarkRead: (itemIds: string[]) => void;
  onRefresh: (feed: RssFeed) => void;
}) {
  if (!menu) return null;
  return createPortal(
    <div className="rss-context-menu">
      <Dropdown
        autoAdjustOverflow
        closeOnEsc
        margin={0}
        motion={false}
        position="bottomLeft"
        rePosKey={`${menu.x}:${menu.y}`}
        spacing={0}
        trigger="custom"
        visible
        render={
          <Dropdown.Menu>
            <Dropdown.Item
              icon={<IconRefresh />}
              onClick={() => {
                const feed = menu.feed;
                onClose();
                onRefresh(feed);
              }}
            >
              刷新
            </Dropdown.Item>
            <Dropdown.Item
              disabled={!items.some((item) => item.feedId === menu.feed.id && !item.readAt)}
              icon={<IconCheckList />}
              onClick={() => {
                const feed = menu.feed;
                onClose();
                onMarkRead(items.filter((item) => item.feedId === feed.id).map((item) => item.id));
              }}
            >
              设为已读
            </Dropdown.Item>
            <Dropdown.Item
              icon={<IconFolderOpen />}
              onClick={() => {
                onClose();
                onManage();
              }}
            >
              管理订阅源
            </Dropdown.Item>
            <Dropdown.Item
              type="danger"
              icon={<IconDeleteStroked />}
              onClick={() => {
                const feed = menu.feed;
                onClose();
                onDelete(feed);
              }}
            >
              删除订阅源
            </Dropdown.Item>
          </Dropdown.Menu>
        }
        onVisibleChange={(visible) => {
          if (!visible) onClose();
        }}
      >
        <span
          aria-hidden="true"
          className="cursor-context-menu-anchor block fixed [width:0] [height:0] pointer-events-none"
          style={{ left: menu.x, top: menu.y }}
          tabIndex={-1}
        />
      </Dropdown>
    </div>,
    document.body,
  );
}
