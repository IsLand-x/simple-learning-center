interface MarkdownNode {
  type: string;
  value?: string;
  children?: MarkdownNode[];
  position?: { start: { offset?: number }; end: { offset?: number } };
}

// Models sometimes emit spaced delimiters or Chinese punctuation next to closing
// delimiters. Repair only leftover text nodes after the normal Markdown parser.
export function remarkReadableStrong() {
  return (tree: MarkdownNode, file: { value: unknown }) => {
    const source = String(file.value);
    const visit = (node: MarkdownNode) => {
      if (!node.children || ['code', 'inlineCode', 'strong', 'html'].includes(node.type)) return;
      node.children = node.children.flatMap((child) => {
        if (child.type !== 'text' || !child.value) {
          visit(child);
          return [child];
        }
        const raw = source.slice(child.position?.start.offset, child.position?.end.offset);
        if (raw.includes('\\*')) return [child];
        const result: MarkdownNode[] = [];
        let cursor = 0;
        for (const match of child.value.matchAll(/\*\*([^*\n]+?)\*\*/g)) {
          const value = match[1].trim();
          if (!value) continue;
          result.push({ type: 'text', value: child.value.slice(cursor, match.index) });
          result.push({ type: 'strong', children: [{ type: 'text', value }] });
          cursor = match.index + match[0].length;
        }
        if (!cursor) return [child];
        result.push({ type: 'text', value: child.value.slice(cursor) });
        return result;
      });
    };
    visit(tree);
  };
}
