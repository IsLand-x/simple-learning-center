import { describe, expect, it } from 'vitest';
import type { MindMapNode } from '../../../../../../contracts/reading';
import { collapsedMindMapBranches, layoutMindMap } from './layout';

const node = (id: string, parentId: string | null): MindMapNode => ({
  id,
  parentId,
  title: id,
  sources: [],
});
const tree = [
  node('root', null),
  node('a', 'root'),
  node('a1', 'a'),
  node('a2', 'a'),
  node('b', 'root'),
  node('c', 'root'),
  node('c1', 'c'),
];

describe('章节导图布局', () => {
  it('主干保留一级观点，展开分支后恢复原始节点和层级', () => {
    const collapsed = collapsedMindMapBranches(tree);
    expect(layoutMindMap(tree, collapsed).map((item) => item.node.id)).toEqual([
      'root',
      'a',
      'b',
      'c',
    ]);
    collapsed.delete('a');
    const expanded = layoutMindMap(tree, collapsed);
    expect(expanded.find((item) => item.node.id === 'a1')).toMatchObject({
      depth: 2,
      node: tree[2],
    });
    expect(expanded.find((item) => item.node.id === 'c')).toMatchObject({ childCount: 1 });
    expect(tree).toHaveLength(7);
  });

  it('使用实际文字尺寸，长节点和不对称分支不会重叠', () => {
    const sizes = new Map(
      tree.map((item, index) => [item.id, { width: 176 + index * 5, height: 52 + index * 24 }]),
    );
    const placed = layoutMindMap(tree, new Set(), sizes);
    const order = placed.filter((item) => item.depth === 1).sort((a, b) => a.y - b.y);
    expect(order.map((item) => item.node.id)).toEqual(['a', 'b', 'c']);
    for (const a of placed) {
      expect({ width: a.width, height: a.height }).toEqual(sizes.get(a.node.id));
      const parent = placed.find((item) => item.node.id === a.node.parentId);
      if (parent) expect(a.x).toBeGreaterThan(parent.x + parent.width);
      for (const b of placed) {
        if (a === b) continue;
        expect(
          a.x + a.width <= b.x ||
            b.x + b.width <= a.x ||
            a.y + a.height <= b.y ||
            b.y + b.height <= a.y,
        ).toBe(true);
      }
    }
  });

  it('空导图和仅有章节根节点都可以布局', () => {
    expect(layoutMindMap([], new Set())).toEqual([]);
    expect(layoutMindMap([tree[0]], new Set())).toEqual([
      expect.objectContaining({ node: tree[0], depth: 0, childCount: 0 }),
    ]);
  });
});
