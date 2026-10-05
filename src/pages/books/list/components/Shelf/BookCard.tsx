import { IconMore } from '@douyinfe/semi-icons';
import { Button, Progress, Tag, Typography } from '@douyinfe/semi-ui';
import { formatRelativeTime } from '../../../../../util/format';
import type { BookItem, BookList } from '../../../../../../contracts/books';
import { BookCover } from './BookCover';

const { Text } = Typography;

export interface BookCardProps {
  book: BookItem;
  bookLists: BookList[];
  onOpen: (bookId: string) => void;
  onOpenContextMenu: (book: BookItem, x: number, y: number) => void;
}

export function BookCard({ book, bookLists, onOpen, onOpenContextMenu }: BookCardProps) {
  const pinned = Boolean(book.pinnedAt);

  return (
    <article
      className="book-card"
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onOpenContextMenu(book, event.clientX, event.clientY);
      }}
    >
      <button
        type="button"
        className="book-card__open"
        aria-label={`打开《${book.title}》，已读 ${book.progress}%${pinned ? '，已置顶' : ''}`}
        onClick={() => onOpen(book.id)}
      />
      <Button
        className="book-card__menu absolute top-1 right-1 z-[2] touch-manipulation [background:var(--semi-color-bg-1)]"
        theme="borderless"
        type="tertiary"
        size="small"
        icon={<IconMore />}
        aria-label={`《${book.title}》的书籍操作`}
        aria-haspopup="menu"
        onClick={(event) => {
          event.stopPropagation();
          const bounds = event.currentTarget.getBoundingClientRect();
          onOpenContextMenu(
            book,
            event.detail ? event.clientX : bounds.left,
            event.detail ? event.clientY : bounds.bottom,
          );
        }}
      />
      <BookCover book={book} />
      <div className="book-meta min-w-0 [gap:4px] mobile:[gap:2px]">
        <div className="book-meta__topline justify-end pr-6 [margin-bottom:4px]">
          <Text size="small" type="tertiary">
            {formatRelativeTime(book.updatedAt)}
          </Text>
        </div>
        <Text strong ellipsis={{ showTooltip: true }}>
          {book.title}
        </Text>
        <Text size="small" type="tertiary" ellipsis={{ showTooltip: true }}>
          {book.author}
        </Text>
        <div className="book-progress [margin-top:auto] mobile:[margin-top:5px]">
          <div className="book-progress__label justify-between [margin-bottom:8px] mobile:[margin-bottom:5px]">
            <Text size="small" type="tertiary">
              {book.currentChapter || '尚未开始'}
            </Text>
            <Text size="small">{Math.round(book.progress)}%</Text>
          </div>
          <Progress percent={book.progress} showInfo={false} stroke="var(--semi-color-primary)" />
        </div>
        {bookLists.length > 0 && (
          <div className="book-card__lists" aria-label="所属书单">
            {bookLists.map((bookList) => (
              <Tag
                aria-label={`所属书单：${bookList.name}`}
                className="book-card__list-tag"
                color="grey"
                key={bookList.id}
                size="small"
                type="light"
              >
                <span title={bookList.name}>{bookList.name}</span>
              </Tag>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}
