import { IconHandle } from '@douyinfe/semi-icons';
import { Button, Tooltip, Typography } from '@douyinfe/semi-ui';
import { DragDropContext, Draggable, Droppable } from '@hello-pangea/dnd';
import { useMediaQuery } from '../../../../util/browser/useMediaQuery';
import type { BookList } from '../../../../types/domain';

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
    <aside
      className="book-list-nav min-w-0 mobile:overflow-hidden mobile:[background:var(--semi-color-bg-1)]"
      aria-label="书单列表"
    >
      <div className="book-list-nav__heading justify-between [min-height:44px] [padding:0_12px] mobile:[min-height:40px]">
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
              className="book-list-nav__items min-w-0 [gap:2px] [padding:6px] mobile:overflow-x-auto mobile:[scrollbar-width:none] mobile:[touch-action:pan-x]"
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
                      className={`book-list-nav__item relative w-full min-w-0 [min-height:40px] justify-between [gap:2px] [padding:0_4px] [color:var(--semi-color-text-1)] [background:transparent] mobile:[width:180px] mobile:[min-width:180px] mobile:[min-height:44px] mobile:shrink-0${selectedListId === bookList.id ? ' book-list-nav__item--active' : ''}${dragSnapshot.isDragging ? ' book-list-nav__item--dragging' : ''}`}
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
                        className="book-list-nav__select min-w-0 [min-height:40px] justify-between [padding:0_6px] [color:inherit] [background:transparent] [touch-action:manipulation] mobile:[min-height:44px]"
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
