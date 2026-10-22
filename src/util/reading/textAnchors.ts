interface TextPosition {
  node: Text;
  offset: number;
}

export interface DocumentTextAnchor {
  text: string;
  positions: TextPosition[];
}

/** Keep DOM positions alongside normalized text, including text split by inline tags. */
export function documentTextAnchor(
  document: Document,
  root: Node = document.body ?? document.documentElement,
): DocumentTextAnchor {
  const walker = document.createTreeWalker(root, 4);
  const positions: TextPosition[] = [];
  let text = '';
  let previousBlock: Element | null = null;
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if (node.parentElement?.closest('script,style,noscript,template,[hidden]')) continue;
    const block =
      node.parentElement?.closest(
        'h1,h2,h3,h4,h5,h6,p,div,li,blockquote,pre,dt,dd,figcaption,tr',
      ) ?? null;
    if (block !== previousBlock && text && !text.endsWith('\n\n')) {
      text += '\n\n';
      positions.push({ node, offset: 0 }, { node, offset: 0 });
    }
    previousBlock = block;
    const value = node.data;
    for (let offset = 0; offset < value.length; offset++) {
      const character = value[offset];
      if (/\s/.test(character)) {
        if (!text || /\s$/.test(text)) continue;
        text += ' ';
      } else text += character;
      positions.push({ node, offset });
    }
  }
  return { text, positions };
}

export function textAnchorRange(
  document: Document,
  anchor: DocumentTextAnchor,
  start: number,
  end: number,
) {
  const first = anchor.positions[start];
  const last = anchor.positions[end - 1];
  if (!first || !last || start >= end) return undefined;
  const range = document.createRange();
  range.setStart(first.node, first.offset);
  range.setEnd(last.node, Math.min(last.offset + 1, last.node.length));
  return range;
}

export function findQuoteRange(document: Document, quote: string, within?: Range, root?: Node) {
  const anchor = documentTextAnchor(document, root);
  const compact: string[] = [];
  const offsets: number[] = [];
  for (let index = 0; index < anchor.text.length; index++) {
    if (/\s/.test(anchor.text[index])) continue;
    const position = anchor.positions[index];
    if (within && !within.isPointInRange(position.node, position.offset)) continue;
    compact.push(anchor.text[index]);
    offsets.push(index);
  }
  const needle = quote.replace(/\s/g, '');
  if (!needle) return undefined;
  const text = compact.join('');
  const start = text.indexOf(needle);
  if (start < 0 || text.indexOf(needle, start + 1) >= 0) return undefined;
  return textAnchorRange(document, anchor, offsets[start], offsets[start + needle.length - 1] + 1);
}
