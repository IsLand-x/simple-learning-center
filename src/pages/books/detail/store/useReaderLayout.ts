import { useCallback, useEffect, useRef, useState } from 'react';
import type { MobileReaderPanel } from '../components/ReaderPanel/model';
import { useMobileReaderOverlay } from './useMobileReaderOverlay';
import { useReaderResponsiveLayout } from './useReaderResponsiveLayout';

export function useReaderLayout(bookId: string | undefined) {
  const workspaceRef = useRef<HTMLDivElement>(null);
  const [activePanel, setActivePanel] = useState<MobileReaderPanel | null>(null);
  const [mobileChromeVisible, setMobileChromeVisible] = useState(true);
  const [compactTocOpen, setCompactTocOpen] = useState(false);
  const [stylePopoverVisible, setStylePopoverVisible] = useState(false);
  const closeMobileOverlay = useCallback(() => {
    setCompactTocOpen(false);
    setActivePanel(null);
    setStylePopoverVisible(false);
  }, []);
  const { compactReader, mobileReader } = useReaderResponsiveLayout({
    workspaceRef,
    setActivePanel,
    setCompactTocOpen,
    setMobileChromeVisible,
  });
  const mobileOverlayOpen = mobileReader && (compactTocOpen || Boolean(activePanel));

  useMobileReaderOverlay({
    close: closeMobileOverlay,
    open: mobileOverlayOpen,
    setMobileChromeVisible,
  });

  useEffect(() => {
    if (!bookId) return;
    setActivePanel(null);
    setCompactTocOpen(false);
    setMobileChromeVisible(true);
  }, [bookId]);
  function changePanel(panel: MobileReaderPanel | null) {
    if (mobileReader && panel) setCompactTocOpen(false);
    if (mobileReader && panel) setStylePopoverVisible(false);
    setActivePanel(panel);
  }
  const closeToc = useCallback(() => setCompactTocOpen(false), []);
  return {
    workspaceRef,
    activePanel,
    mobileChromeVisible,
    compactTocOpen,
    stylePopoverVisible,
    compactReader,
    mobileReader,
    mobileOverlayOpen,
    closeMobileOverlay,
    changePanel,
    revealHighlights: () => setActivePanel('highlights'),
    closeToc,
    setCompactTocOpen,
    setMobileChromeVisible,
    setStylePopoverVisible,
  };
}
