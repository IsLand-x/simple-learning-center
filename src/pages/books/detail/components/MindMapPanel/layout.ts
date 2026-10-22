import { graphlib, layout, type EdgeLabel, type GraphLabel, type NodeLabel } from '@dagrejs/dagre';
import type { MindMapNode } from '../../../../../../contracts/reading';

export interface MindMapNodeSize {
  width: number;
  height: number;
}

export interface PositionedMindMapNode extends MindMapNodeSize {
  node: MindMapNode;
  x: number;
  y: number;
  depth: number;
  childCount: number;
}

export function collapsedMindMapBranches(nodes: MindMapNode[]) {
  const parents = new Set(nodes.map((node) => node.parentId));
  return new Set(
    nodes.filter((node) => node.parentId && parents.has(node.id)).map((node) => node.id),
  );
}

export function layoutMindMap(
  nodes: MindMapNode[],
  collapsed: ReadonlySet<string>,
  sizes: ReadonlyMap<string, MindMapNodeSize> = new Map(),
) {
  const children = new Map<string | null, MindMapNode[]>();
  nodes.forEach((node) =>
    children.set(node.parentId, [...(children.get(node.parentId) ?? []), node]),
  );
  const visible: Array<{ node: MindMapNode; depth: number; childCount: number }> = [];
  const visit = (node: MindMapNode, depth: number) => {
    visible.push({ node, depth, childCount: children.get(node.id)?.length ?? 0 });
    if (!collapsed.has(node.id)) children.get(node.id)?.forEach((child) => visit(child, depth + 1));
  };
  children.get(null)?.forEach((node) => visit(node, 0));
  const graph = new graphlib.Graph<GraphLabel, NodeLabel, EdgeLabel>();
  graph.setGraph({ rankdir: 'LR', ranksep: 32, nodesep: 16, marginx: 20, marginy: 20 });
  graph.setDefaultEdgeLabel(() => ({}));
  visible.forEach(({ node, childCount }) => {
    graph.setNode(node.id, {
      ...(sizes.get(node.id) ?? { width: childCount ? 192 : 176, height: 64 }),
    });
  });
  visible.forEach(({ node }) => {
    if (node.parentId) graph.setEdge(node.parentId, node.id);
  });
  // A chapter is an ordered tree; crossing minimization must not reverse its reading order.
  layout(graph, { disableOptimalOrderHeuristic: true });
  return visible.map((item): PositionedMindMapNode => {
    const position = graph.node(item.node.id);
    return {
      ...item,
      width: position.width,
      height: position.height,
      x: position.x! - position.width / 2,
      y: position.y! - position.height / 2,
    };
  });
}
