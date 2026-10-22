import { IconMinus, IconPlus, IconExpand } from '@douyinfe/semi-icons';
import { Button, ButtonGroup, Tooltip } from '@douyinfe/semi-ui';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChapterMindMap, MindMapNode } from '../../../../../../contracts/reading';
import { layoutMindMap } from './layout';
import { MindMapNodeCard } from './MindMapNodeCard';

export function MindMapCanvas({
  mindMap,
  selectedId,
  onSelect,
}: {
  mindMap: ChapterMindMap;
  selectedId?: string;
  onSelect: (node: MindMapNode) => void;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [camera, setCamera] = useState({ scale: 1, x: 0, y: 0 });
  const drag = useRef<{ id: number; x: number; y: number; originX: number; originY: number }>();
  const layout = useMemo(() => layoutMindMap(mindMap.nodes, collapsed), [mindMap.nodes, collapsed]);
  const fit = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const scale = Math.min(
      1,
      Math.max(
        window.matchMedia('(max-width: 800px)').matches ? 0.6 : 0.2,
        Math.min(
          (viewport.clientWidth - 24) / layout.width,
          (viewport.clientHeight - 24) / layout.height,
        ),
      ),
    );
    setCamera({
      scale,
      x: (viewport.clientWidth - layout.width * scale) / 2,
      y: (viewport.clientHeight - layout.height * scale) / 2,
    });
  }, [layout.width, layout.height]);
  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    fit();
    return () => observer.disconnect();
  }, [fit]);
  const zoom = (factor: number) =>
    setCamera((current) => {
      const scale = Math.max(
        window.matchMedia('(max-width: 800px)').matches ? 0.6 : 0.2,
        Math.min(2, current.scale * factor),
      );
      const x = (viewportRef.current?.clientWidth ?? 0) / 2;
      const y = (viewportRef.current?.clientHeight ?? 0) / 2;
      return {
        scale,
        x: x - ((x - current.x) * scale) / current.scale,
        y: y - ((y - current.y) * scale) / current.scale,
      };
    });
  const byId = new Map(layout.nodes.map((item) => [item.node.id, item]));
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-3 px-3 py-2 [color:var(--semi-color-text-2)]">
        <span className="text-[12px]">拖动画布 · 点击观点查看原文</span>
        <ButtonGroup aria-label="导图缩放" className="mindmap-controls">
          <Tooltip content="缩小">
            <Button
              aria-label="缩小导图"
              icon={<IconMinus />}
              size="small"
              theme="borderless"
              type="tertiary"
              onClick={() => zoom(1 / 1.2)}
            />
          </Tooltip>
          <Tooltip content="适应面板">
            <Button
              aria-label="导图适应面板"
              icon={<IconExpand />}
              size="small"
              theme="borderless"
              type="tertiary"
              onClick={fit}
            />
          </Tooltip>
          <Tooltip content="放大">
            <Button
              aria-label="放大导图"
              icon={<IconPlus />}
              size="small"
              theme="borderless"
              type="tertiary"
              onClick={() => zoom(1.2)}
            />
          </Tooltip>
        </ButtonGroup>
      </div>
      <div
        ref={viewportRef}
        role="region"
        aria-label="章节思维导图画布，可用方向键平移"
        tabIndex={0}
        className="mindmap-canvas relative min-h-[160px] min-w-0 flex-1 overflow-hidden [touch-action:none] focus-visible:outline-2 focus-visible:[outline-color:var(--semi-color-focus-border)]"
        onKeyUp={(event) => {
          if (event.key.startsWith('Arrow')) event.preventDefault();
        }}
        onKeyDown={(event) => {
          if (!event.key.startsWith('Arrow')) return;
          event.preventDefault();
          setCamera((current) => ({
            ...current,
            x: current.x + (event.key === 'ArrowLeft' ? 40 : event.key === 'ArrowRight' ? -40 : 0),
            y: current.y + (event.key === 'ArrowUp' ? 40 : event.key === 'ArrowDown' ? -40 : 0),
          }));
        }}
        onPointerDown={(event) => {
          if (!event.isPrimary || event.button !== 0 || (event.target as Element).closest('button'))
            return;
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = {
            id: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            originX: camera.x,
            originY: camera.y,
          };
        }}
        onPointerMove={(event) => {
          const start = drag.current;
          if (start?.id !== event.pointerId) return;
          setCamera((current) => ({
            ...current,
            x: start.originX + event.clientX - start.x,
            y: start.originY + event.clientY - start.y,
          }));
        }}
        onPointerUp={() => {
          drag.current = undefined;
        }}
        onPointerCancel={() => {
          drag.current = undefined;
        }}
      >
        <div
          className="absolute origin-top-left"
          style={{
            width: layout.width,
            height: layout.height,
            transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})`,
          }}
        >
          <svg
            width={layout.width}
            height={layout.height}
            className="pointer-events-none absolute inset-0"
            aria-hidden="true"
          >
            {layout.nodes.map((item) => {
              const parent = item.node.parentId ? byId.get(item.node.parentId) : undefined;
              if (!parent) return null;
              const x = parent.x + 210;
              return (
                <path
                  key={item.node.id}
                  d={`M ${x} ${parent.y + 38} C ${x + 36} ${parent.y + 38}, ${item.x - 36} ${item.y + 38}, ${item.x} ${item.y + 38}`}
                  fill="none"
                  stroke="var(--semi-color-border)"
                  strokeWidth={2}
                />
              );
            })}
          </svg>
          {layout.nodes.map((item) => (
            <MindMapNodeCard
              key={item.node.id}
              item={item}
              scale={camera.scale}
              selected={selectedId === item.node.id}
              collapsed={collapsed.has(item.node.id)}
              onSelect={() => onSelect(item.node)}
              onToggle={() =>
                setCollapsed((current) => {
                  const next = new Set(current);
                  if (next.has(item.node.id)) next.delete(item.node.id);
                  else next.add(item.node.id);
                  return next;
                })
              }
            />
          ))}
        </div>
      </div>
    </div>
  );
}
