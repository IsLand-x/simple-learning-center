import {
  getViewportForBounds,
  type Edge,
  type OnNodesChange,
  type ReactFlowInstance,
} from '@xyflow/react';
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { MindMapNode } from '../../../../../../contracts/reading';
import { collapsedMindMapBranches, layoutMindMap, type MindMapNodeSize } from './layout';
import type { MindMapFlowNode } from './type';

type PendingView = { kind: 'readable' } | { kind: 'anchor'; id: string; x: number; y: number };

export function useMindMapGraph(
  source: MindMapNode[],
  selectedId: string | undefined,
  onSelect: (node: MindMapNode) => void,
  flow: RefObject<ReactFlowInstance<MindMapFlowNode> | null>,
  canvas: RefObject<HTMLDivElement>,
) {
  const [collapsed, setCollapsed] = useState(() => {
    const initial = collapsedMindMapBranches(source);
    let parent = source.find((node) => node.id === selectedId)?.parentId;
    while (parent) {
      initial.delete(parent);
      parent = source.find((node) => node.id === parent)?.parentId;
    }
    return initial;
  });
  const [sizes, setSizes] = useState<Map<string, MindMapNodeSize>>(new Map());
  const [initialized, setInitialized] = useState(false);
  const pendingView = useRef<PendingView | null>({ kind: 'readable' });
  const positioned = useMemo(
    () => layoutMindMap(source, collapsed, sizes),
    [source, collapsed, sizes],
  );
  const onToggle = useCallback(
    (id: string) => {
      const node = flow.current?.getNode(id);
      if (node) pendingView.current = { kind: 'anchor', id, ...node.position };
      setCollapsed((current) => {
        const next = new Set(current);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    },
    [flow],
  );
  const nodes = useMemo(
    (): MindMapFlowNode[] =>
      positioned.map((item) => ({
        id: item.node.id,
        type: 'mindmap',
        position: { x: item.x, y: item.y },
        style: {
          width: 'max-content',
          minWidth: item.childCount ? 128 : 104,
          maxWidth: item.childCount ? 208 : 192,
        },
        data: {
          node: item.node,
          depth: item.depth,
          childCount: item.childCount,
          collapsed: collapsed.has(item.node.id),
          active: item.node.id === selectedId,
          onSelect,
          onToggle,
        },
      })),
    [positioned, collapsed, selectedId, onSelect, onToggle],
  );
  const edges = useMemo(
    (): Edge[] =>
      positioned.flatMap(({ node, depth }) =>
        node.parentId
          ? [
              {
                id: `${node.parentId}:${node.id}`,
                source: node.parentId,
                target: node.id,
                type: 'default',
                style: {
                  stroke:
                    depth === 1
                      ? 'var(--semi-color-primary-light-active)'
                      : 'var(--semi-color-border)',
                  strokeWidth: depth === 1 ? 2 : 1.5,
                },
              },
            ]
          : [],
      ),
    [positioned],
  );
  const onNodesChange: OnNodesChange<MindMapFlowNode> = useCallback((changes) => {
    setSizes((current) => {
      const next = new Map(current);
      for (const change of changes) {
        if (change.type !== 'dimensions' || !change.dimensions) continue;
        const previous = next.get(change.id);
        if (
          previous?.width === change.dimensions.width &&
          previous.height === change.dimensions.height
        )
          continue;
        next.set(change.id, change.dimensions);
      }
      return [...next].some(([id, size]) => size !== current.get(id)) ? next : current;
    });
  }, []);
  useEffect(() => {
    const instance = flow.current;
    const pending = pendingView.current;
    if (
      !initialized ||
      !instance ||
      !pending ||
      !positioned.length ||
      positioned.some((item) => !sizes.has(item.node.id))
    )
      return;
    pendingView.current = null;
    const viewport = instance.getViewport();
    if (pending.kind === 'anchor') {
      const anchor = positioned.find((item) => item.node.id === pending.id);
      if (anchor)
        void instance.setViewport({
          ...viewport,
          x: viewport.x + (pending.x - anchor.x) * viewport.zoom,
          y: viewport.y + (pending.y - anchor.y) * viewport.zoom,
        });
      return;
    }
    const pane = canvas.current;
    if (!pane) return;
    const bounds = {
      x: Math.min(...positioned.map((node) => node.x)),
      y: Math.min(...positioned.map((node) => node.y)),
      width:
        Math.max(...positioned.map((node) => node.x + node.width)) -
        Math.min(...positioned.map((node) => node.x)),
      height:
        Math.max(...positioned.map((node) => node.y + node.height)) -
        Math.min(...positioned.map((node) => node.y)),
    };
    const fitted = getViewportForBounds(bounds, pane.clientWidth, pane.clientHeight, 0.85, 1, 0.12);
    void instance.setViewport({ ...fitted, x: Math.max(fitted.x, 16 - bounds.x * fitted.zoom) });
  }, [initialized, positioned, sizes, flow, canvas]);
  const showBranches = (all: boolean) => {
    pendingView.current = { kind: 'readable' };
    setCollapsed(all ? new Set() : collapsedMindMapBranches(source));
  };
  return {
    nodes,
    edges,
    onNodesChange,
    showBranches,
    overview: collapsed.size > 0 || collapsedMindMapBranches(source).size === 0,
    initialize: () => setInitialized(true),
  };
}
