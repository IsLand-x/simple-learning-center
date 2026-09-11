import { useCallback, useEffect, useRef } from 'react';
import type { BookItem } from '../../../types';

type UpdateBook = (bookId: string, changes: Partial<BookItem>) => void;

export function useDeferredBookLocation(book: BookItem | undefined, updateBook: UpdateBook) {
  const latestBookRef = useRef(book);
  const pendingLocationSaveRef = useRef<{
    bookId: string;
    changes: Partial<BookItem>;
  } | null>(null);
  const locationSaveDelayRef = useRef<number | null>(null);
  const locationSaveIdleRef = useRef<number | null>(null);

  useEffect(() => {
    latestBookRef.current = book;
  }, [book]);

  const commitPendingLocation = useCallback(() => {
    locationSaveDelayRef.current = null;
    locationSaveIdleRef.current = null;
    const pending = pendingLocationSaveRef.current;
    pendingLocationSaveRef.current = null;
    if (pending) updateBook(pending.bookId, pending.changes);
  }, [updateBook]);

  const cancelScheduledLocationSave = useCallback(() => {
    if (locationSaveDelayRef.current !== null) {
      window.clearTimeout(locationSaveDelayRef.current);
      locationSaveDelayRef.current = null;
    }
    if (locationSaveIdleRef.current !== null) {
      if ('cancelIdleCallback' in window) window.cancelIdleCallback(locationSaveIdleRef.current);
      locationSaveIdleRef.current = null;
    }
  }, []);

  const flushPendingLocation = useCallback(() => {
    cancelScheduledLocationSave();
    commitPendingLocation();
  }, [cancelScheduledLocationSave, commitPendingLocation]);

  const scheduleLocationSave = useCallback(() => {
    cancelScheduledLocationSave();
    locationSaveDelayRef.current = window.setTimeout(() => {
      locationSaveDelayRef.current = null;
      if ('requestIdleCallback' in window) {
        locationSaveIdleRef.current = window.requestIdleCallback(commitPendingLocation, {
          timeout: 800,
        });
      } else {
        commitPendingLocation();
      }
    }, 220);
  }, [cancelScheduledLocationSave, commitPendingLocation]);

  const queueLocationSave = useCallback(
    (current: BookItem, changes: Partial<BookItem>) => {
      latestBookRef.current = { ...current, ...changes };
      pendingLocationSaveRef.current = { bookId: current.id, changes };
      scheduleLocationSave();
    },
    [scheduleLocationSave],
  );

  useEffect(() => {
    const handlePageHide = () => flushPendingLocation();
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flushPendingLocation();
    };
    window.addEventListener('pagehide', handlePageHide);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('pagehide', handlePageHide);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      flushPendingLocation();
    };
  }, [flushPendingLocation]);

  return { latestBookRef, queueLocationSave };
}
