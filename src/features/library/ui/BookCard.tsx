import { Progress, Tag, Typography } from '@douyinfe/semi-ui';
import { formatRelativeTime } from '../../../lib/format';
import type { BookItem, BookList } from '../../../types';
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
      <BookCover book={book} />
      <div className="book-meta">
        <div className="book-meta__topline">
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
        <div className="book-progress">
          <div className="book-progress__label">
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
