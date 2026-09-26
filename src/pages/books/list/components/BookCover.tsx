import { useEffect, useRef } from 'react';
import { recoverMissingBookCover } from '../../../../util/epub/bookCovers';
import { useLearningStore } from '../../../../util/state/useLearningStore';
import type { BookItem } from '../../../../util/types';
import { bookCoverTone } from '../store/model/libraryView';

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
        className={
          compact
            ? 'book-cover-image block object-cover [background:var(--semi-color-fill-0)] mobile:[aspect-ratio:3_/_4] mobile:object-cover book-cover-image--compact'
            : 'book-cover-image block object-cover [background:var(--semi-color-fill-0)] mobile:[aspect-ratio:3_/_4] mobile:object-cover'
        }
        src={book.coverDataUrl}
        alt={`${book.title} 封面`}
      />
    );
  }
  const tone = bookCoverTone(book.id);
  return (
    <div
      ref={placeholderRef}
      className={`book-cover relative justify-end [gap:6px] overflow-hidden [color:var(--semi-color-white)] [background:var(--semi-color-primary)] [box-shadow:inset_4px_0_0_color-mix(in_srgb,_var(--semi-color-black)_16%,_transparent)] mobile:[aspect-ratio:3_/_4] book-cover--${tone}${compact ? ' book-cover--compact' : ''}`}
      aria-hidden="true"
    >
      {!compact && (
        <span className="book-cover__eyebrow [margin-bottom:auto] [letter-spacing:0.08em]">
          PERSONAL LIBRARY
        </span>
      )}
      <strong>{book.title}</strong>
      {!compact && <span>{book.author}</span>}
    </div>
  );
}
