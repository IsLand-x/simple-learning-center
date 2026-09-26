import {
  IconClose,
  IconDeleteStroked,
  IconEditStroked,
  IconHandle,
  IconPlus,
} from '@douyinfe/semi-icons';
import { Button, Empty, Tooltip, Typography } from '@douyinfe/semi-ui';
import {
  DragDropContext,
  Draggable,
  Droppable,
  type DragStart,
  type DragUpdate,
  type DropResult,
  type ResponderProvided,
} from '@hello-pangea/dnd';
import type { BookItem, BookList } from '../../../../types/domain';
import { BookCover } from './BookCover';

const { Title, Text } = Typography;

interface BookListDetailProps {
  bookList: BookList;
  books: BookItem[];
  onDragStart: (start: DragStart, provided: ResponderProvided) => void;
  onDragUpdate: (update: DragUpdate, provided: ResponderProvided) => void;
  onDragEnd: (result: DropResult, provided: ResponderProvided) => void;
  onEdit: () => void;
  onManageBooks: () => void;
  onOpenBook: (bookId: string) => void;
  onRemoveBook: (bookId: string) => void;
  onRemoveList: () => void;
}

export function BookListDetail({
  bookList,
  books,
  onDragStart,
  onDragUpdate,
  onDragEnd,
  onEdit,
  onManageBooks,
  onOpenBook,
  onRemoveBook,
  onRemoveList,
}: BookListDetailProps) {
  return (
    <div className="book-list-detail min-w-0 min-h-0 mobile:overflow-hidden mobile:[background:var(--semi-color-bg-1)]">
      <header className="book-list-detail__header items-start justify-between [min-height:76px] [gap:16px] [padding:12px_12px_12px_16px] mobile:min-h-0 mobile:flex-wrap mobile:[padding:12px]">
        <div className="book-list-detail__identity min-w-0 [gap:4px]">
          <Title heading={5} ellipsis={{ showTooltip: true }}>
            {bookList.name}
          </Title>
          <Text
            type="tertiary"
            className={bookList.note ? '' : 'book-list-detail__empty-note [font-style:italic]'}
          >
            {bookList.note || '暂无备注'}
          </Text>
        </div>
        <div className="book-list-detail__actions [gap:4px]">
          <Button
            icon={<IconPlus />}
            size="small"
            theme="solid"
            type="primary"
            onClick={onManageBooks}
          >
            管理书籍
          </Button>
          <Tooltip content="编辑书单">
            <Button
              aria-label="编辑书单"
              icon={<IconEditStroked />}
              size="small"
              theme="borderless"
              type="tertiary"
              onClick={onEdit}
            />
          </Tooltip>
          <Tooltip content="删除书单">
            <Button
              aria-label="删除书单"
              icon={<IconDeleteStroked />}
              size="small"
              theme="borderless"
              type="danger"
              onClick={onRemoveList}
            />
          </Tooltip>
        </div>
      </header>

      {books.length ? (
        <DragDropContext
          dragHandleUsageInstructions="按空格键开始拖动，使用方向键调整位置，再按空格键放下；按 Escape 取消。"
          onDragStart={onDragStart}
          onDragUpdate={onDragUpdate}
          onDragEnd={onDragEnd}
        >
          <Droppable droppableId={`book-list:${bookList.id}`}>
            {(dropProvided, dropSnapshot) => (
              <div
                ref={dropProvided.innerRef}
                {...dropProvided.droppableProps}
                className={`book-list-books [min-height:120px] [padding:12px] mobile:[padding:8px] ${dropSnapshot.isDraggingOver ? ' book-list-books--dragging-over' : ''}`}
              >
                {books.map((book, index) => (
                  <Draggable
                    draggableId={`book-list-item:${book.id}`}
                    index={index}
                    key={book.id}
                    disableInteractiveElementBlocking
                  >
                    {(dragProvided, dragSnapshot) => (
                      <article
                        ref={dragProvided.innerRef}
                        {...dragProvided.draggableProps}
                        className={`book-list-book min-w-0 [min-height:82px] [gap:6px] [padding:8px] [background:var(--semi-color-bg-0)] mobile:[min-height:80px] mobile:[padding:7px_4px] ${dragSnapshot.isDragging ? ' book-list-book--dragging' : ''}`}
                        style={dragProvided.draggableProps.style}
                      >
                        <Tooltip content="拖动排序">
                          <button
                            {...dragProvided.dragHandleProps}
                            aria-label={`拖动《${book.title}》调整排序`}
                            className="book-list-book__handle [width:44px] [min-width:44px] [min-height:64px] [place-items:center] [padding:0] [color:var(--semi-color-text-2)] [background:transparent] [cursor:grab] [touch-action:none]"
                            type="button"
                          >
                            <IconHandle />
                          </button>
                        </Tooltip>
                        <button
                          className="book-list-book__main min-w-0 [align-self:stretch] [padding:0] [color:inherit] [background:transparent] [text-align:left]"
                          type="button"
                          onClick={() => onOpenBook(book.id)}
                        >
                          <BookCover book={book} compact />
                          <span className="book-list-book__copy min-w-0 [gap:2px]">
                            <Text strong ellipsis={{ showTooltip: true }}>
                              {book.title}
                            </Text>
                            <Text size="small" type="tertiary" ellipsis={{ showTooltip: true }}>
                              {book.author}
                            </Text>
                            <Text size="small" type="tertiary">
                              已读 {Math.round(book.progress)}%
                            </Text>
                          </span>
                        </button>
                        <Tooltip content="从书单移除">
                          <Button
                            aria-label={`从书单移除《${book.title}》`}
                            icon={<IconClose />}
                            size="small"
                            theme="borderless"
                            type="tertiary"
                            onClick={() => onRemoveBook(book.id)}
                          />
                        </Tooltip>
                      </article>
                    )}
                  </Draggable>
                ))}
                {dropProvided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      ) : (
        <div className="book-list-detail__empty [min-height:300px] [place-items:center] [align-content:center] [padding:24px]">
          <Empty title="书单还是空的" description="添加书籍后，可以拖动调整阅读顺序" />
          <Button icon={<IconPlus />} theme="solid" type="primary" onClick={onManageBooks}>
            添加书籍
          </Button>
        </div>
      )}
    </div>
  );
}
