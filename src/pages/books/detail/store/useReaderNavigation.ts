import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useLearningStore } from '../../../../store/useLearningStore';
import type { BookItem, TocItem } from '../../../../../contracts/books';
import type { MindMapSource } from '../../../../../contracts/reading';
import { findChapterLabel, isReaderKeyboardEditingTarget } from '../components/ReaderSurface/model';
import type { ReaderLocationUpdate, ReaderSurfaceHandle } from '../components/ReaderSurface/type';
import { useDeferredBookLocation } from './useDeferredBookLocation';
import { useReadingSession } from './useReadingSession';

export function useReaderNavigation(
  book: BookItem | undefined,
  readerRef: RefObject<ReaderSurfaceHandle>,
  closeToc: () => void,
) {
  const updateBook = useLearningStore((state) => state.updateBook);
  const upsertReadingSession = useLearningStore((state) => state.upsertReadingSession);
  const recordPageChangeRef = useRef<((page?: number, href?: string, cfi?: string) => void) | null>(
    null,
  );
  const [returnCfi, setReturnCfi] = useState<string | null>(null);
  const [activeHref, setActiveHref] = useState(book?.toc[0]?.href);
  const { latestBookRef, queueLocationSave } = useDeferredBookLocation(book, updateBook);
  const bookId = book?.id;
  useEffect(() => {
    const current = latestBookRef.current;
    setReturnCfi(null);
    if (!current) return;
    const chapter = current.toc.find((item) => item.label === current.currentChapter);
    setActiveHref(chapter?.href ?? current.toc[0]?.href);
  }, [bookId, latestBookRef]);
  useReadingSession(book?.id, upsertReadingSession, recordPageChangeRef);

  useEffect(() => {
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      if (isReaderKeyboardEditingTarget(event.target)) return;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        event.preventDefault();
        readerRef.current?.prev();
      } else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        event.preventDefault();
        readerRef.current?.next();
      }
    };
    window.addEventListener('keyup', handleKeyUp);
    return () => window.removeEventListener('keyup', handleKeyUp);
  }, [readerRef]);
  const handleLocationChange = useCallback(
    (location: ReaderLocationUpdate) => {
      const current = latestBookRef.current;
      if (!current) return;
      recordPageChangeRef.current?.(location.page, location.href, location.cfi);
      const chapter = findChapterLabel(current.toc, location.href) ?? current.currentChapter;
      setActiveHref(location.href);
      const roundedProgress =
        location.progress === undefined
          ? current.progress
          : Math.round(location.progress * 10) / 10;
      const hasChanged =
        Math.abs(current.progress - roundedProgress) >= 0.1 ||
        current.currentCfi !== location.cfi ||
        current.currentChapter !== chapter ||
        current.currentPage !== location.page ||
        current.totalPages !== location.totalPages;
      if (!hasChanged) return;
      const changes: Partial<BookItem> = {
        progress: roundedProgress,
        currentCfi: location.cfi ?? current.currentCfi,
        currentChapter: chapter,
        currentPage: location.page ?? current.currentPage,
        totalPages: location.totalPages ?? current.totalPages,
      };
      queueLocationSave(current, changes);
    },
    [latestBookRef, queueLocationSave],
  );
  const selectToc = (item: TocItem, closeOverlay = true) => {
    rememberProgress();
    setActiveHref(item.href);
    readerRef.current?.display(item.href, item.label);
    if (closeOverlay) closeToc();
  };
  // Capture the live location before a reference jump, even while its delayed
  // persistence is pending. Keep the first location across several references.
  const rememberProgress = () => {
    if (!readerRef.current) return;
    const cfi = latestBookRef.current?.currentCfi;
    if (cfi) setReturnCfi((original) => original ?? cfi);
  };
  const jumpToCfi = (cfi: string) => {
    rememberProgress();
    readerRef.current?.display(cfi);
  };
  const locateSource = async (source: MindMapSource) => {
    const reader = readerRef.current;
    if (!reader?.locateSource) throw new Error('阅读器尚未就绪');
    const cfi = latestBookRef.current?.currentCfi;
    // A failed lookup must not create a return entry. Capture before awaiting,
    // since the successful navigation changes the current CFI.
    await reader.locateSource(source);
    if (latestBookRef.current?.id === bookId && cfi) setReturnCfi((original) => original ?? cfi);
  };
  const returnToProgress = returnCfi
    ? () => {
        readerRef.current?.display(returnCfi);
        setReturnCfi(null);
        closeToc();
      }
    : undefined;
  const currentChapter = useMemo(
    () => (book ? (findChapterLabel(book.toc, activeHref) ?? book.currentChapter) : ''),
    [activeHref, book],
  );
  return {
    activeHref,
    currentChapter,
    handleLocationChange,
    selectToc,
    jumpToCfi,
    locateSource,
    returnToProgress,
  };
}
