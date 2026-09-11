import { useEffect, useRef } from 'react';
import { recoverMissingBookCover } from '../../../lib/bookCovers';
import { useLearningStore } from '../../../store/useLearningStore';
import type { BookItem } from '../../../types';
import { bookCoverTone } from '../model/libraryView';

export interface BookCoverProps {
  book: BookItem;
  compact?: boolean;
}

export function BookCover({ book, compact = false }: BookCoverProps) {
  const placeholderRef = useRef<HTMLDivElement>(null);
  const setBookCovers = useLearningStore((state) => state.setBookCovers);

  useEffect(() => {
    if (book.kind !== 'epub' || typeof book.coverDataUrl === 'string') return undefined;
    const placeholder = placeholderRef.current;
    if (!placeholder) return undefined;
    let disposed = false;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        void recoverMissingBookCover(book).then((cover) => {
          if (!disposed && typeof cover === 'string') setBookCovers({ [book.id]: cover });
        });
      },
      { rootMargin: '240px' },
    );
    observer.observe(placeholder);
    return () => {
      disposed = true;
      observer.disconnect();
    };
  }, [book, setBookCovers]);

  if (book.coverDataUrl) {
    return (
      <img
        className={compact ? 'book-cover-image book-cover-image--compact' : 'book-cover-image'}
        src={book.coverDataUrl}
        alt={`${book.title} 封面`}
      />
    );
  }
  const tone = bookCoverTone(book.id);
  return (
    <div
      ref={placeholderRef}
      className={`book-cover book-cover--${tone}${compact ? ' book-cover--compact' : ''}`}
      aria-hidden="true"
    >
      {!compact && <span className="book-cover__eyebrow">PERSONAL LIBRARY</span>}
      <strong>{book.title}</strong>
      {!compact && <span>{book.author}</span>}
    </div>
  );
}
