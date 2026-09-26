import type { KeyboardEvent } from 'react';
import { Progress, Typography } from '@douyinfe/semi-ui';
import { formatRelativeTime } from '../../../../util/format';
import type { BookItem } from '../../../../util/types';
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
      className="book-card [grid-template-columns:112px_minmax(0,_1fr)] [gap:16px] [min-height:178px] [background:var(--semi-color-bg-1)] [transition:border-color_180ms_ease,_background-color_180ms_ease] [@media(max-width:480px)]:[grid-template-columns:84px_minmax(0,_1fr)] mobile:min-w-0 mobile:min-h-0 mobile:[gap:8px] mobile:[background:transparent]"
      role="button"
      tabIndex={0}
      aria-label={`打开《${book.title}》，已读 ${book.progress}%`}
      onClick={() => onOpen(book.id)}
      onKeyDown={handleKeyDown}
    >
      <BookCover book={book} />
      <div className="book-meta min-w-0 [gap:4px] mobile:[gap:2px]">
        <div className="book-meta__topline justify-end [margin-bottom:4px]">
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
      </div>
    </article>
  );
}
