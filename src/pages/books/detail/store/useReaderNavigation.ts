import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useLearningStore } from '../../../../store/useLearningStore';
import type { BookItem, TocItem } from '../../../../../contracts/books';
import type { MindMapSource } from '../../../../../contracts/reading';
import { findChapterLabel, isReaderKeyboardEditingTarget } from '../components/ReaderSurface/model';
import type { ReaderLocationUpdate, ReaderSurfaceHandle } from '../components/ReaderSurface/type';
import {
  isSameDemoAnchor,
  isSameReaderPlace,
  isUserDrivenLocation,
  locationFromBook,
  reportedReaderLocation,
  shouldPersistReportedLocation,
  type ReportedReaderLocation,
} from './readerLocationSync';
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
  const openedBookRef = useRef(book);
  const lastReportedRef = useRef<ReportedReaderLocation | null>(null);
  const pendingTargetRef = useRef<string | null>(null);
  const bookId = book?.id;
  useEffect(() => {
    if (openedBookRef.current?.id === bookId) return;
    openedBookRef.current = book;
    lastReportedRef.current = null;
  }, [book, bookId]);
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
      const opened = openedBookRef.current;
      if (!current || !opened || current.id !== opened.id) return;
      recordPageChangeRef.current?.(location.page, location.href, location.cfi);
      const chapter = findChapterLabel(current.toc, location.href) ?? current.currentChapter;
      setActiveHref(location.href);
      const next = reportedReaderLocation(current, { ...location, chapter });
      const previousReport = lastReportedRef.current;
      const pendingTarget = pendingTargetRef.current;
      const matchesPending =
        pendingTarget !== null &&
        (location.href === pendingTarget ||
          location.cfi === pendingTarget ||
          next.currentCfi === pendingTarget);
      const layoutReason =
        !location.reason || location.reason === 'anchor' || location.reason === 'navigation';
      const jumpArrived =
        pendingTarget !== null &&
        (matchesPending ||
          (layoutReason &&
            (previousReport === null ||
              previousReport.currentCfi !== next.currentCfi ||
              previousReport.currentChapter !== next.currentChapter)));
      const userDriven = isUserDrivenLocation(location.reason, jumpArrived);
      if (jumpArrived) pendingTargetRef.current = null;
      const stored = locationFromBook(current);
      const placeChanged =
        userDriven &&
        shouldPersistReportedLocation(locationFromBook(opened), stored, previousReport, next);
      const layoutReport =
        location.reason === 'anchor' ||
        location.reason === 'navigation' ||
        location.reason === 'page' ||
        location.reason === 'snap' ||
        location.reason === 'scroll';
      const samePlace = isSameReaderPlace(stored, next);
      const establish = layoutReport && !stored.currentCfi && Boolean(next.currentCfi);
      const fillPages =
        layoutReport &&
        samePlace &&
        stored.totalPages === undefined &&
        next.totalPages !== undefined;
      const demoCanonical =
        layoutReport &&
        stored.currentCfi !== next.currentCfi &&
        isSameDemoAnchor(stored.currentCfi, next.currentCfi);
      if (!placeChanged && !establish && !fillPages && !demoCanonical) {
        lastReportedRef.current = next;
        return;
      }
      lastReportedRef.current = next;
      const cosmetic = !placeChanged && !establish;
      queueLocationSave(
        current,
        cosmetic
          ? {
              progress: stored.progress,
              currentCfi: next.currentCfi ?? stored.currentCfi,
              currentChapter: stored.currentChapter,
              currentPage: fillPages ? next.currentPage : stored.currentPage,
              totalPages: next.totalPages ?? stored.totalPages,
              updatedAt: current.updatedAt,
              locationUpdatedAt: current.locationUpdatedAt,
            }
          : {
              progress: next.progress,
              currentCfi: next.currentCfi,
              currentChapter: next.currentChapter,
              currentPage: next.currentPage,
              totalPages: next.totalPages,
            },
      );
    },
    [latestBookRef, queueLocationSave],
  );
  const selectToc = (item: TocItem, closeOverlay = true) => {
    rememberProgress();
    pendingTargetRef.current = item.href;
    setActiveHref(item.href);
    readerRef.current?.display(item.href, item.label);
    if (closeOverlay) closeToc();
  };
  // Capture the live location before a reference jump, even while its delayed
  // persistence is pending. Keep the first location across several references.
  const rememberProgress = () => {
    if (!readerRef.current) return;
    const cfi = lastReportedRef.current?.currentCfi ?? latestBookRef.current?.currentCfi;
    if (cfi) setReturnCfi((original) => original ?? cfi);
  };
  const jumpToCfi = (cfi: string) => {
    rememberProgress();
    pendingTargetRef.current = cfi;
    readerRef.current?.display(cfi);
  };
  const locateSource = async (source: MindMapSource) => {
    const reader = readerRef.current;
    if (!reader?.locateSource) throw new Error('阅读器尚未就绪');
    const cfi = lastReportedRef.current?.currentCfi ?? latestBookRef.current?.currentCfi;
    // A failed lookup must not create a return entry. Capture before awaiting,
    // since the successful navigation changes the current CFI.
    pendingTargetRef.current = source.cfi ?? null;
    try {
      await reader.locateSource(source);
    } catch (error) {
      pendingTargetRef.current = null;
      throw error;
    }
    if (latestBookRef.current?.id === bookId && cfi) setReturnCfi((original) => original ?? cfi);
  };
  const returnToProgress = returnCfi
    ? () => {
        pendingTargetRef.current = returnCfi;
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
