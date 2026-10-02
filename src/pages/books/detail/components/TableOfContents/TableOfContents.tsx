import { IconBookOpenStroked } from '@douyinfe/semi-icons';
import { Button, Typography } from '@douyinfe/semi-ui';
import { useEffect, useRef } from 'react';
import type { TocItem } from '../../../../../../contracts/books';

import { findActiveItem } from './navigation';
import { TocRow } from './TocRow';

const { Text } = Typography;

interface TableOfContentsProps {
  activeItemAlignment?: 'center' | 'nearest';
  activeItemVisible?: boolean;
  items: TocItem[];
  activeHref?: string;
  currentPage?: number;
  progress: number;
  onSelect: (item: TocItem) => void;
  onReturnToProgress?: () => void;
}

export function TableOfContents({
  activeItemAlignment = 'nearest',
  activeItemVisible = true,
  items,
  activeHref,
  currentPage,
  progress,
  onSelect,
  onReturnToProgress,
}: TableOfContentsProps) {
  const listRef = useRef<HTMLElement>(null);
  // Server synchronization recreates items; only a different selected chapter should scroll.
  const activeItemHref = findActiveItem(items, activeHref)?.href;
  const safeProgress = Math.max(0, Math.min(100, progress));
  const safeCurrentPage =
    typeof currentPage === 'number' && Number.isFinite(currentPage)
      ? Math.max(1, Math.round(currentPage))
      : undefined;

  useEffect(() => {
    if (!activeItemVisible || !activeItemHref) return undefined;
    const frame = window.requestAnimationFrame(() => {
      const list = listRef.current;
      const activeItem = list?.querySelector<HTMLElement>('.toc-item--selected');
      if (!list || !activeItem) return;
      if (activeItemAlignment === 'nearest') {
        activeItem.scrollIntoView({ block: 'nearest' });
        return;
      }
      const listRect = list.getBoundingClientRect();
      const activeItemRect = activeItem.getBoundingClientRect();
      const centeredScrollTop =
        list.scrollTop +
        activeItemRect.top -
        listRect.top -
        (list.clientHeight - activeItemRect.height) / 2;
      list.scrollTop = Math.max(
        0,
        Math.min(list.scrollHeight - list.clientHeight, centeredScrollTop),
      );
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeItemHref, activeItemAlignment, activeItemVisible]);

  return (
    <aside className="toc-panel w-full min-h-0 overflow-hidden [background:var(--semi-color-bg-1)]">
      <div className="panel-titlebar [height:var(--reader-bar-height)] [min-height:var(--reader-bar-height)] justify-between [padding:0_8px_0_12px]">
        <div className="panel-titlebar__title min-w-0 [color:var(--semi-color-text-1)]">
          <IconBookOpenStroked />
          <Text strong>目录</Text>
        </div>
        <Text
          size="small"
          type="tertiary"
          className="toc-progress-label"
          role="status"
          aria-label={`阅读进度 ${Math.round(safeProgress)}%`}
        >
          {Math.round(safeProgress)}% · {items.length} 章
        </Text>
      </div>
      <nav ref={listRef} className="toc-list min-h-0 [padding:6px]" aria-label="书籍目录">
        {items.map((item) => (
          <TocRow
            key={item.id || item.href}
            item={item}
            depth={0}
            activeHref={activeHref}
            currentPage={safeCurrentPage}
            onSelect={onSelect}
          />
        ))}
      </nav>
      {onReturnToProgress && (
        <div className="toc-panel__return [padding:8px_max(12px,_env(safe-area-inset-right))_max(12px,_env(safe-area-inset-bottom))_max(12px,_env(safe-area-inset-left))] [background:var(--semi-color-bg-1)]">
          <Button block theme="light" onClick={onReturnToProgress}>
            回到原进度
          </Button>
        </div>
      )}
    </aside>
  );
}
