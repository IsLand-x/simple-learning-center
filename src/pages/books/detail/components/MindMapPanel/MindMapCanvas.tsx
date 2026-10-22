import '@xyflow/react/dist/base.css';
import { IconMinus, IconPlus, IconExpand } from '@douyinfe/semi-icons';
import { Button, ButtonGroup, Tooltip } from '@douyinfe/semi-ui';
import { ReactFlow, type ReactFlowInstance } from '@xyflow/react';
import { useRef, useState } from 'react';
import type { ChapterMindMap, MindMapNode } from '../../../../../../contracts/reading';
import { MindMapNodeCard } from './MindMapNodeCard';
import type { MindMapFlowNode } from './type';
import { useMindMapGraph } from './useMindMapGraph';

const nodeTypes = { mindmap: MindMapNodeCard };

export function MindMapCanvas({
  mindMap,
  selectedId,
  onSelect,
}: {
  mindMap: ChapterMindMap;
  selectedId?: string;
  onSelect: (node: MindMapNode) => void;
}) {
  const flow = useRef<ReactFlowInstance<MindMapFlowNode> | null>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const graph = useMindMapGraph(mindMap.nodes, selectedId, onSelect, flow, canvas);
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-2 gap-y-1 px-3 py-2">
        <ButtonGroup aria-label="导图层级" className="mindmap-actions">
          <Button
            size="small"
            theme={graph.overview ? 'solid' : 'borderless'}
            type={graph.overview ? 'primary' : 'tertiary'}
            aria-pressed={graph.overview}
            onClick={() => graph.showBranches(false)}
          >
            主干
          </Button>
          <Button
            size="small"
            theme={!graph.overview ? 'solid' : 'borderless'}
            type={!graph.overview ? 'primary' : 'tertiary'}
            aria-pressed={!graph.overview}
            onClick={() => graph.showBranches(true)}
          >
            全部
          </Button>
        </ButtonGroup>
        <div className="mindmap-controls flex items-center gap-1">
          <Tooltip content="缩小">
            <Button
              aria-label="缩小导图"
              icon={<IconMinus />}
              size="small"
              theme="borderless"
              type="tertiary"
              onClick={() => void flow.current?.zoomOut()}
            />
          </Tooltip>
          <span
            className="w-9 text-center text-[12px] tabular-nums [color:var(--semi-color-text-2)]"
            aria-label="导图缩放比例"
          >
            {Math.round(zoom * 100)}%
          </span>
          <Tooltip content="放大">
            <Button
              aria-label="放大导图"
              icon={<IconPlus />}
              size="small"
              theme="borderless"
              type="tertiary"
              onClick={() => void flow.current?.zoomIn()}
            />
          </Tooltip>
          <Tooltip content="查看整张导图">
            <Button
              aria-label="导图适应面板"
              icon={<IconExpand />}
              size="small"
              theme="borderless"
              type="tertiary"
              onClick={() =>
                void flow.current?.fitView({ padding: 0.12, minZoom: 0.2, maxZoom: 1 })
              }
            />
          </Tooltip>
        </div>
      </div>
      <div
        ref={canvas}
        role="region"
        aria-label="章节思维导图画布，可用方向键平移"
        tabIndex={0}
        className="mindmap-canvas relative min-h-[160px] min-w-0 flex-1 overflow-hidden focus-visible:outline-2 focus-visible:[outline-color:var(--semi-color-focus-border)]"
        onKeyUp={(event) => {
          if (event.key.startsWith('Arrow')) event.preventDefault();
        }}
        onKeyDown={(event) => {
          if (!event.key.startsWith('Arrow') || !flow.current) return;
          event.preventDefault();
          const viewport = flow.current.getViewport();
          void flow.current.setViewport({
            ...viewport,
            x: viewport.x + (event.key === 'ArrowLeft' ? 40 : event.key === 'ArrowRight' ? -40 : 0),
            y: viewport.y + (event.key === 'ArrowUp' ? 40 : event.key === 'ArrowDown' ? -40 : 0),
          });
        }}
      >
        <ReactFlow<MindMapFlowNode>
          nodes={graph.nodes}
          edges={graph.edges}
          nodeTypes={nodeTypes}
          onNodesChange={graph.onNodesChange}
          onInit={(instance) => {
            flow.current = instance;
            graph.initialize();
          }}
          onMove={(_, viewport) => setZoom(viewport.zoom)}
          minZoom={0.2}
          maxZoom={2}
          nodesDraggable={false}
          nodesConnectable={false}
          nodesFocusable={false}
          edgesFocusable={false}
          elementsSelectable={false}
          deleteKeyCode={null}
          selectionKeyCode={null}
          zoomOnDoubleClick={false}
          panOnScroll
          disableKeyboardA11y
          aria-label="章节观点关系"
          attributionPosition="bottom-right"
        />
      </div>
      <p className="shrink-0 px-3 pt-2 text-[12px] [color:var(--semi-color-text-2)]">
        点击观点查看原文 · 拖动或双指缩放
      </p>
    </div>
  );
}
