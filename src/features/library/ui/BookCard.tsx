import type { KeyboardEvent } from 'react';
import { Progress, Typography } from '@douyinfe/semi-ui';
import { formatRelativeTime } from '../../../lib/format';
import type { BookItem } from '../../../types';
import { BookCover } from './BookCover';

const { Text } = Typography;

export interface BookCardProps {
  book: BookItem;
  onOpen: (bookId: string) => void;
}

export function BookCard({ book, onOpen }: BookCardProps) {
  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    onOpen(book.id);
  };

  return (
    <article
      className="book-card"
      role="button"
      tabIndex={0}
      aria-label={`打开《${book.title}》，已读 ${book.progress}%`}
      onClick={() => onOpen(book.id)}
      onKeyDown={handleKeyDown}
    >
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
      </div>
    </article>
  );
}
