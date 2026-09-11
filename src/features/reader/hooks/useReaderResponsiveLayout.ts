import { useEffect, useState, type Dispatch, type RefObject, type SetStateAction } from 'react';
import type { MobileReaderPanel } from '../../../components/ReaderRightSidebar';

export function useReaderResponsiveLayout({
  workspaceRef,
  setActivePanel,
  setCompactTocOpen,
  setMobileChromeVisible,
}: {
  workspaceRef: RefObject<HTMLDivElement>;
  setActivePanel: Dispatch<SetStateAction<MobileReaderPanel | null>>;
  setCompactTocOpen: Dispatch<SetStateAction<boolean>>;
  setMobileChromeVisible: Dispatch<SetStateAction<boolean>>;
}) {
  const [compactReader, setCompactReader] = useState(() => window.innerWidth < 900);
  const [mobileReader, setMobileReader] = useState(
    () => window.matchMedia('(max-width: 800px)').matches,
  );

  useEffect(() => {
    const workspace = workspaceRef.current;
    if (!workspace) return;
    const observer = new ResizeObserver(([entry]) => {
      const isCompact = entry.contentRect.width < 720;
      setCompactReader(isCompact);
      if (!isCompact) setCompactTocOpen(false);
    });
    observer.observe(workspace);
    return () => observer.disconnect();
  }, [setCompactTocOpen, workspaceRef]);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 800px)');
    const update = () => {
      setMobileReader(media.matches);
      if (!media.matches) setMobileChromeVisible(true);
      if (!media.matches) setActivePanel((panel) => (panel === 'style' ? null : panel));
    };
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [setActivePanel, setMobileChromeVisible]);

  return { compactReader, mobileReader };
}
