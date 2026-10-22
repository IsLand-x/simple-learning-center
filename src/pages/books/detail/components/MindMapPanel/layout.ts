import type { MindMapNode } from '../../../../../../contracts/reading';

export interface PositionedMindMapNode {
  node: MindMapNode;
  x: number;
  y: number;
  hasChildren: boolean;
}

export function layoutMindMap(nodes: MindMapNode[], collapsed: ReadonlySet<string>) {
  const children = new Map<string | null, MindMapNode[]>();
  nodes.forEach((node) =>
    children.set(node.parentId, [...(children.get(node.parentId) ?? []), node]),
  );
  const placed: PositionedMindMapNode[] = [];
  let row = 0;
  const visit = (node: MindMapNode, depth: number): number => {
    const descendants = collapsed.has(node.id) ? [] : (children.get(node.id) ?? []);
    const positions = descendants.map((child) => visit(child, depth + 1));
    const y = positions.length ? (positions[0] + positions.at(-1)!) / 2 : row++ * 100 + 24;
    placed.push({
      node,
      x: depth * 260 + 24,
      y,
      hasChildren: Boolean(children.get(node.id)?.length),
    });
    return y;
  };
  (children.get(null) ?? []).forEach((node) => visit(node, 0));
  return {
    nodes: placed,
    width: Math.max(280, ...placed.map((item) => item.x + 248)),
    height: Math.max(140, ...placed.map((item) => item.y + 100)),
  };
}
