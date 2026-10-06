import type { View as FoliateView } from 'foliate-js/view.js';
import type { HighlightItem } from '../../../../../../../contracts/reading';

// Only loaded chapter documents are scanned. The cache owns ranges, never pixel geometry;
// Foliate redraws them after pagination/font/layout changes without changing the EPUB DOM.
const cache = new WeakMap<Document, { signature: string; items: HighlightItem[] }>();

export function findTermRanges(doc: Document, terms: HighlightItem[]) {
  if (!terms.length) return [];
  const nodes: Text[] = [];
  const walker = doc.createTreeWalker(doc.body, 4);
  let node = walker.nextNode();
  while (node) {
    const text = node as Text;
    if (text.data && !text.parentElement?.closest('script, style, noscript, svg, rt, [hidden]')) {
      nodes.push(text);
    }
    node = walker.nextNode();
  }
  // Keep inline markup transparent but prevent matches across separate paragraphs.
  const blocks: Text[][] = [];
  let previousBlock: Element | null = null;
  for (const text of nodes) {
    const block =
      text.parentElement?.closest('p, div, li, h1, h2, h3, h4, h5, h6, td, blockquote') ?? doc.body;
    if (block !== previousBlock) blocks.push([]);
    blocks.at(-1)!.push(text);
    previousBlock = block;
  }
  const matches: Array<{ term: HighlightItem; range: Range }> = [];
  const ordered = [...terms]
    .filter((term) => term.text.trim())
    .sort((a, b) => b.text.length - a.text.length);
  for (const block of blocks) {
    const text = block.map((part) => part.data).join('');
    const occupied: Array<{ start: number; end: number }> = [];
    for (const term of ordered) {
      const pattern = term.text
        .trim()
        .split(/\s+/)
        .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('\\s+');
      const regex = new RegExp(pattern, 'gu');
      for (const match of text.matchAll(regex)) {
        const start = match.index;
        const end = start + match[0].length;
        if (/^[A-Za-z0-9_]$/.test(text[start - 1] ?? '') && /^[A-Za-z0-9_]/.test(term.text))
          continue;
        if (/^[A-Za-z0-9_]$/.test(text[end] ?? '') && /[A-Za-z0-9_]$/.test(term.text)) continue;
        if (occupied.some((item) => start < item.end && end > item.start)) continue;
        const range = doc.createRange();
        let offset = 0;
        let started = false;
        for (const part of block) {
          const limit = offset + part.length;
          if (!started && start < limit) {
            range.setStart(part, start - offset);
            started = true;
          }
          if (started && end <= limit) {
            range.setEnd(part, end - offset);
            break;
          }
          offset = limit;
        }
        occupied.push({ start, end });
        matches.push({ term, range });
      }
    }
  }
  return matches;
}

export function loadedAnnotations(
  view: FoliateView,
  sectionIndex: number,
  highlights: HighlightItem[],
) {
  const ordinary = highlights.filter(
    (item) => item.kind !== 'term' && view.resolveNavigation(item.cfi)?.index === sectionIndex,
  );
  const terms = highlights.filter((item) => item.kind === 'term');
  if (!terms.length) return ordinary;
  const content = view.renderer.getContents().find((item) => item.index === sectionIndex);
  if (!content) return ordinary;
  const signature = JSON.stringify(terms.map((item) => [item.id, item.text, item.updatedAt]));
  let cached = cache.get(content.doc);
  if (!cached || cached.signature !== signature) {
    cached = {
      signature,
      items: findTermRanges(content.doc, terms).map(({ term, range }) => ({
        ...term,
        cfi: view.getCFI(sectionIndex, range),
      })),
    };
    cache.set(content.doc, cached);
  }
  return [...ordinary, ...cached.items];
}
