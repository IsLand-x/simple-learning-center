import { Tooltip, Typography } from '@douyinfe/semi-ui';
import { IconBookOpenStroked } from '@douyinfe/semi-icons';
import { useEffect, useRef, type KeyboardEvent } from 'react';
import type { TocItem } from '../types';

const { Text } = Typography;

interface TableOfContentsProps {
  activeItemAlignment?: 'center' | 'nearest';
  activeItemVisible?: boolean;
  items: TocItem[];
  activeHref?: string;
  progress: number;
  onSelect: (item: TocItem) => void;
}

function normalizeHref(href?: string) {
  if (!href) return undefined;
  try {
    return decodeURI(href).replace(/^\.\//, '').replace(/^\//, '');
  } catch {
    return href.replace(/^\.\//, '').replace(/^\//, '');
  }
}

function hrefsMatch(left?: string, right?: string) {
  const normalizedLeft = normalizeHref(left);
  const normalizedRight = normalizeHref(right);
  if (!normalizedLeft || !normalizedRight) return false;
  return normalizedLeft === normalizedRight
    || normalizedLeft.endsWith(`/${normalizedRight}`)
    || normalizedRight.endsWith(`/${normalizedLeft}`);
}

function TocRow({
  item,
  depth,
  activeHref,
  onSelect,
}: {
  item: TocItem;
  depth: number;
  activeHref?: string;
  onSelect: (item: TocItem) => void;
}) {
  const selected = hrefsMatch(item.href, activeHref);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    onSelect(item);
  };

  return (
    <>
      <Tooltip content={item.label} position="right" mouseEnterDelay={500}>
        <div
          className={`toc-item${selected ? ' toc-item--selected' : ''}`}
          style={{ paddingLeft: 8 + depth * 16 }}
          role="button"
          tabIndex={0}
          aria-current={selected ? 'location' : undefined}
          onClick={() => onSelect(item)}
          onKeyDown={handleKeyDown}
        >
          <Text ellipsis={{ showTooltip: false }}>{item.label}</Text>
        </div>
      </Tooltip>
      {item.subitems?.map((child) => (
        <TocRow key={child.id || child.href} item={child} depth={depth + 1} activeHref={activeHref} onSelect={onSelect} />
      ))}
    </>
  );
}

export function TableOfContents({
  activeItemAlignment = 'nearest',
  activeItemVisible = true,
  items,
  activeHref,
  progress,
  onSelect,
}: TableOfContentsProps) {
  const listRef = useRef<HTMLElement>(null);
  const safeProgress = Math.max(0, Math.min(100, progress));

  useEffect(() => {
    if (!activeItemVisible || !activeHref) return undefined;
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
      const centeredScrollTop = list.scrollTop
        + activeItemRect.top
        - listRect.top
        - (list.clientHeight - activeItemRect.height) / 2;
      list.scrollTop = Math.max(
        0,
        Math.min(list.scrollHeight - list.clientHeight, centeredScrollTop),
      );
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeHref, activeItemAlignment, activeItemVisible, items]);

  return (
    <aside className="toc-panel">
      <div className="panel-titlebar">
        <div className="panel-titlebar__title">
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
      <nav ref={listRef} className="toc-list" aria-label="书籍目录">
        {items.map((item) => (
          <TocRow key={item.id || item.href} item={item} depth={0} activeHref={activeHref} onSelect={onSelect} />
        ))}
      </nav>
    </aside>
  );
}
