import type { Node } from '@xyflow/react';
import type { MindMapNode } from '../../../../../../contracts/reading';

export interface MindMapPanelSelection {
  chapterId: string;
  nodeId?: string;
}

export type MindMapFlowNode = Node<
  {
    node: MindMapNode;
    depth: number;
    childCount: number;
    collapsed: boolean;
    active: boolean;
    onSelect: (node: MindMapNode) => void;
    onToggle: (id: string) => void;
  },
  'mindmap'
>;
