import { Tooltip, Typography } from '@douyinfe/semi-ui';
import { IconArticle, IconBookOpenStroked } from '@douyinfe/semi-icons';
import type { KeyboardEvent } from 'react';
import type { TocItem } from '../types';

const { Text } = Typography;

interface TableOfContentsProps {
  items: TocItem[];
  activeHref?: string;
  onSelect: (item: TocItem) => void;
}

function normalizeHref(href?: string) {
  return href?.split('#')[0].replace(/^\.\//, '');
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
  const selected = normalizeHref(item.href) === normalizeHref(activeHref);
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
          <IconArticle size="small" />
          <Text ellipsis={{ showTooltip: false }}>{item.label}</Text>
        </div>
      </Tooltip>
      {item.subitems?.map((child) => (
        <TocRow key={child.id || child.href} item={child} depth={depth + 1} activeHref={activeHref} onSelect={onSelect} />
      ))}
    </>
  );
}

export function TableOfContents({ items, activeHref, onSelect }: TableOfContentsProps) {
  return (
    <aside className="toc-panel">
      <div className="panel-titlebar">
        <div className="panel-titlebar__title">
          <IconBookOpenStroked />
          <Text strong>目录</Text>
        </div>
        <Text size="small" type="tertiary">{items.length} 章</Text>
      </div>
      <nav className="toc-list" aria-label="书籍目录">
        {items.map((item) => (
          <TocRow key={item.id || item.href} item={item} depth={0} activeHref={activeHref} onSelect={onSelect} />
        ))}
      </nav>
    </aside>
  );
}
