import { IconChevronDown, IconChevronRight } from '@douyinfe/semi-icons';
import { Button } from '@douyinfe/semi-ui';
import type { PositionedMindMapNode } from './layout';

export function MindMapNodeCard({
  item,
  selected,
  scale,
  collapsed,
  onSelect,
  onToggle,
}: {
  item: PositionedMindMapNode;
  selected: boolean;
  scale: number;
  collapsed: boolean;
  onSelect: () => void;
  onToggle: () => void;
}) {
  return (
    <div
      className="mindmap-node absolute flex items-center gap-1"
      style={{ left: item.x, top: item.y, width: 232, height: 76 }}
    >
      <button
        type="button"
        aria-pressed={selected}
        title={item.node.title}
        className={`mindmap-node__content h-full min-w-0 flex-1 rounded-[var(--semi-border-radius-medium)] border border-solid px-3 py-2 text-left text-[14px] leading-[1.5] [background:var(--semi-color-bg-0)] [color:var(--semi-color-text-0)] hover:[background:var(--semi-color-fill-0)] focus-visible:outline-2 focus-visible:[outline-color:var(--semi-color-focus-border)] ${selected ? '[border-color:var(--semi-color-primary)] [background:var(--semi-color-primary-light-default)]' : '[border-color:var(--semi-color-border)]'}`}
        onClick={onSelect}
      >
        <span className="line-clamp-3">{item.node.title}</span>
      </button>
      {item.hasChildren && (
        <span
          className="mindmap-node__toggle flex shrink-0 items-center justify-center"
          style={{ width: 44 / Math.max(0.6, scale) }}
        >
          <Button
            style={{ transform: `scale(${1 / Math.max(0.6, scale)})` }}
            aria-label={`${collapsed ? '展开' : '收起'}“${item.node.title}”的子节点`}
            aria-expanded={!collapsed}
            icon={collapsed ? <IconChevronRight /> : <IconChevronDown />}
            theme="borderless"
            type="tertiary"
            size="small"
            onClick={onToggle}
          />
        </span>
      )}
    </div>
  );
}
