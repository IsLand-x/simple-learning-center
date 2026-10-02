import { Tooltip, Typography } from '@douyinfe/semi-ui';
import type { KeyboardEvent } from 'react';
import type { TocItem } from '../../../../../../contracts/books';
import { hrefsMatch } from './navigation';

const { Text } = Typography;

export function TocRow({
  item,
  depth,
  activeHref,
  currentPage,
  onSelect,
}: {
  item: TocItem;
  depth: number;
  activeHref?: string;
  currentPage?: number;
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
          className={`toc-item [min-height:40px] [margin-bottom:4px] [padding:8px] [color:var(--semi-color-text-1)] ${selected ? ' toc-item--selected' : ''}`}
          style={{ paddingLeft: 8 + depth * 16 }}
          role="button"
          tabIndex={0}
          aria-current={selected ? 'location' : undefined}
          onClick={() => onSelect(item)}
          onKeyDown={handleKeyDown}
        >
          <Text className="toc-item__label" ellipsis={{ showTooltip: false }}>
            {item.label}
          </Text>
          {selected && currentPage !== undefined && (
            <Text className="toc-item__page" size="small">
              第 {currentPage} 页
            </Text>
          )}
        </div>
      </Tooltip>
      {item.subitems?.map((child) => (
        <TocRow
          key={child.id || child.href}
          item={child}
          depth={depth + 1}
          activeHref={activeHref}
          currentPage={currentPage}
          onSelect={onSelect}
        />
      ))}
    </>
  );
}
