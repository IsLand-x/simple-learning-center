import { IconChevronDown, IconChevronRight } from '@douyinfe/semi-icons';
import { Button } from '@douyinfe/semi-ui';
import { Handle, Position, useReactFlow, type NodeProps } from '@xyflow/react';
import type { MindMapFlowNode } from './type';

export function MindMapNodeCard({ id, data }: NodeProps<MindMapFlowNode>) {
  const { node, depth, childCount, collapsed, active, onSelect, onToggle } = data;
  const flow = useReactFlow<MindMapFlowNode>();
  return (
    <div
      className={`mindmap-node pointer-events-auto flex items-center ${depth === 0 ? 'mindmap-node--root' : depth === 1 ? 'mindmap-node--branch' : 'mindmap-node--leaf'} ${active ? 'mindmap-node--active' : ''}`}
      onFocusCapture={(event) => {
        if (!event.target.matches(':focus-visible')) return;
        const current = flow.getNode(id);
        if (current)
          void flow.setCenter(
            current.position.x + (current.measured?.width ?? 0) / 2,
            current.position.y + (current.measured?.height ?? 0) / 2,
            { zoom: Math.max(0.85, flow.getZoom()) },
          );
      }}
    >
      {node.parentId && <Handle type="target" position={Position.Left} isConnectable={false} />}
      <button
        type="button"
        aria-pressed={active}
        title={node.title}
        className="mindmap-node__content nodrag nopan min-h-[52px] min-w-0 flex-1 rounded-[var(--semi-border-radius-small)] border border-solid px-3 py-2 text-left text-[14px] leading-[1.5] [overflow-wrap:anywhere] focus-visible:outline-2 focus-visible:[outline-color:var(--semi-color-focus-border)]"
        onClick={() => onSelect(node)}
      >
        <span className="line-clamp-3">{node.title}</span>
      </button>
      {childCount > 0 && (
        <span className="mindmap-node__toggle nodrag nopan flex w-[52px] shrink-0 items-center justify-center">
          <Button
            aria-label={`${collapsed ? '展开' : '收起'}“${node.title}”的子节点`}
            aria-expanded={!collapsed}
            title={`${childCount} 个分支`}
            icon={collapsed ? <IconChevronRight /> : <IconChevronDown />}
            theme="borderless"
            type="tertiary"
            size="small"
            onClick={() => onToggle(node.id)}
          />
        </span>
      )}
      {childCount > 0 && <Handle type="source" position={Position.Right} isConnectable={false} />}
    </div>
  );
}
