import { createPortal } from 'react-dom';
import { Dropdown } from '@douyinfe/semi-ui';
import { IconBookmark, IconCheckList, IconMailStroked } from '@douyinfe/semi-icons';
import type { RssItem } from '../../../../types/domain';
import type { RssItemMenuState } from '../store/menuTypes';

export function RssItemContextMenu({
  menu,
  onClose,
  onMarkRead,
  onMarkUnread,
  onToggleBookmark,
}: {
  menu: RssItemMenuState | null;
  onClose: () => void;
  onMarkRead: (item: RssItem) => void;
  onMarkUnread: (item: RssItem) => void;
  onToggleBookmark: (item: RssItem) => void;
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
            {menu.item.readAt ? (
              <Dropdown.Item
                icon={<IconMailStroked />}
                onClick={() => {
                  const item = menu.item;
                  onClose();
                  onMarkUnread(item);
                }}
              >
                标为未读
              </Dropdown.Item>
            ) : (
              <Dropdown.Item
                icon={<IconCheckList />}
                onClick={() => {
                  const item = menu.item;
                  onClose();
                  onMarkRead(item);
                }}
              >
                设为已读
              </Dropdown.Item>
            )}
            <Dropdown.Item
              icon={<IconBookmark />}
              onClick={() => {
                const item = menu.item;
                onClose();
                onToggleBookmark(item);
              }}
            >
              {menu.item.bookmarkedAt ? '取消收藏' : '设为收藏'}
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
