import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  IconChevronRight,
  IconDeleteStroked,
  IconFavoriteList,
  IconPlus,
  IconTick,
  IconTop,
} from '@douyinfe/semi-icons';
import { Dropdown } from '@douyinfe/semi-ui';
import type { BookItem, BookList } from '../../../types';

export interface LibraryBookContextMenuState {
  book: BookItem;
  x: number;
  y: number;
}

export function LibraryBookContextMenu({
  bookLists,
  menu,
  onClose,
  onDelete,
  onPinnedChange,
  onRequestCreateList,
  onToggleBookList,
}: {
  bookLists: BookList[];
  menu: LibraryBookContextMenuState | null;
  onClose: () => void;
  onDelete: (book: BookItem) => void;
  onPinnedChange: (book: BookItem, pinned: boolean) => void;
  onRequestCreateList: (book: BookItem) => void;
  onToggleBookList: (book: BookItem, bookList: BookList) => void;
}) {
  useEffect(() => {
    if (!menu) return;
    const close = () => onClose();
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (
        event.target instanceof Element &&
        event.target.closest('.library-book-context-menu, .library-book-list-submenu')
      ) {
        return;
      }
      onClose();
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', closeOnOutsidePointer, true);
    document.addEventListener('keydown', closeOnEscape, true);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer, true);
      document.removeEventListener('keydown', closeOnEscape, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [menu, onClose]);

  if (!menu) return null;

  return createPortal(
    <Dropdown
      autoAdjustOverflow
      closeOnEsc
      contentClassName="library-book-context-menu"
      margin={0}
      motion={false}
      position="bottomLeft"
      rePosKey={`${menu.book.id}:${menu.x}:${menu.y}`}
      spacing={0}
      trigger="custom"
      visible
      render={
        <Dropdown.Menu>
          <Dropdown.Item
            icon={<IconTop />}
            onClick={() => {
              const { book } = menu;
              onClose();
              onPinnedChange(book, !book.pinnedAt);
            }}
          >
            {menu.book.pinnedAt ? '取消置顶' : '置顶'}
          </Dropdown.Item>
          <Dropdown
            autoAdjustOverflow
            clickToHide={false}
            contentClassName="library-book-list-submenu"
            motion={false}
            mouseEnterDelay={0}
            mouseLeaveDelay={120}
            position="rightTop"
            spacing={0}
            trigger="hover"
            render={
              <Dropdown.Menu>
                {bookLists.length ? (
                  bookLists.map((bookList) => {
                    const assigned = bookList.bookIds.includes(menu.book.id);
                    return (
                      <Dropdown.Item
                        active={assigned}
                        icon={assigned ? <IconTick /> : <IconFavoriteList />}
                        key={bookList.id}
                        onClick={() => {
                          const { book } = menu;
                          onToggleBookList(book, bookList);
                        }}
                      >
                        <span className="library-book-list-submenu__name" title={bookList.name}>
                          {bookList.name}
                        </span>
                      </Dropdown.Item>
                    );
                  })
                ) : (
                  <Dropdown.Item disabled>暂无书单</Dropdown.Item>
                )}
                <Dropdown.Divider />
                <Dropdown.Item
                  icon={<IconPlus />}
                  onClick={() => {
                    const { book } = menu;
                    onClose();
                    onRequestCreateList(book);
                  }}
                >
                  新建书单
                </Dropdown.Item>
              </Dropdown.Menu>
            }
          >
            <Dropdown.Item icon={<IconFavoriteList />}>
              <span className="library-book-context-menu__submenu-label">
                <span>移动到书单</span>
                <IconChevronRight />
              </span>
            </Dropdown.Item>
          </Dropdown>
          <Dropdown.Divider />
          <Dropdown.Item
            type="danger"
            icon={<IconDeleteStroked />}
            onClick={() => {
              const { book } = menu;
              onClose();
              onDelete(book);
            }}
          >
            删除
          </Dropdown.Item>
        </Dropdown.Menu>
      }
      onVisibleChange={(visible) => {
        if (!visible) onClose();
      }}
    >
      <span
        aria-hidden="true"
        className="cursor-context-menu-anchor"
        style={{ left: menu.x, top: menu.y }}
        tabIndex={-1}
      />
    </Dropdown>,
    document.body,
  );
}
