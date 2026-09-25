import { IconHandle } from '@douyinfe/semi-icons';
import { Button, Tooltip, Typography } from '@douyinfe/semi-ui';
import { DragDropContext, Draggable, Droppable } from '@hello-pangea/dnd';
import { useMediaQuery } from '../../../shared/browser/useMediaQuery';
import type { BookList } from '../../../types';

const { Text } = Typography;

interface BookListNavigationProps {
  bookLists: BookList[];
  selectedListId: string | null;
  onSelect: (bookListId: string) => void;
  onMove: (bookListId: string, destinationIndex: number) => void;
}

export function BookListNavigation({
  bookLists,
  selectedListId,
  onSelect,
  onMove,
}: BookListNavigationProps) {
  const isMobile = useMediaQuery('(max-width: 800px)');

  return (
    <aside className="book-list-nav" aria-label="书单列表">
      <div className="book-list-nav__heading">
        <Text strong>全部书单</Text>
        <Text size="small" type="tertiary">
          {bookLists.length}
        </Text>
      </div>
      <DragDropContext
        key={isMobile ? 'horizontal' : 'vertical'}
        dragHandleUsageInstructions={`按空格键开始拖动，使用${isMobile ? '左右' : '上下'}方向键调整书单顺序，再按空格键放下；按 Escape 取消。`}
        onDragStart={(start, provided) => {
          const bookList = bookLists.find((item) => item.id === start.draggableId);
          provided.announce(
            `已抓取书单“${bookList?.name ?? ''}”，使用方向键调整位置，空格键放下。`,
          );
        }}
        onDragUpdate={(update, provided) => {
          provided.announce(
            update.destination
              ? `将移动到第 ${update.destination.index + 1} 位。`
              : '当前不在可放置区域。',
          );
        }}
        onDragEnd={(result, provided) => {
          if (result.reason === 'CANCEL' || !result.destination) {
            provided.announce('已取消拖动。');
            return;
          }
          if (result.source.index === result.destination.index) {
            provided.announce('书单位置未改变。');
            return;
          }
          onMove(result.draggableId, result.destination.index);
          provided.announce(`已将书单移动到第 ${result.destination.index + 1} 位。`);
        }}
      >
        <Droppable
          droppableId="book-list-navigation"
          direction={isMobile ? 'horizontal' : 'vertical'}
        >
          {(dropProvided) => (
            <div
              ref={dropProvided.innerRef}
              {...dropProvided.droppableProps}
              className="book-list-nav__items"
            >
              {bookLists.map((bookList, index) => (
                <Draggable
                  draggableId={bookList.id}
                  index={index}
                  key={bookList.id}
                  disableInteractiveElementBlocking
                >
                  {(dragProvided, dragSnapshot) => (
                    <div
                      ref={dragProvided.innerRef}
                      {...dragProvided.draggableProps}
                      className={`book-list-nav__item${selectedListId === bookList.id ? ' book-list-nav__item--active' : ''}${dragSnapshot.isDragging ? ' book-list-nav__item--dragging' : ''}`}
                      style={dragProvided.draggableProps.style}
                    >
                      <Tooltip content="拖动调整书单顺序">
                        <Button
                          {...dragProvided.dragHandleProps}
                          aria-label={`拖动书单“${bookList.name}”调整排序`}
                          className="book-list-nav__handle"
                          icon={<IconHandle />}
                          theme="borderless"
                          type="tertiary"
                        />
                      </Tooltip>
                      <button
                        aria-current={selectedListId === bookList.id ? 'true' : undefined}
                        className="book-list-nav__select"
                        type="button"
                        onClick={() => onSelect(bookList.id)}
                      >
                        <span title={bookList.name}>{bookList.name}</span>
                        <Text size="small" type="tertiary">
                          {bookList.bookIds.length}
                        </Text>
                      </button>
                    </div>
                  )}
                </Draggable>
              ))}
              {dropProvided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>
    </aside>
  );
}
