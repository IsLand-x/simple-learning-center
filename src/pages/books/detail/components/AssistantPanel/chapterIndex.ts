import { fromRange, joinIndir, fake } from 'foliate-js/epubcfi.js';
import type { TocItem } from '../../../../../../contracts/books';
import type { BookPassage } from '../../../../../api/reading/type';
import { documentTextAnchor, textAnchorRange } from '../../../../../util/reading/textAnchors';

export function normalizeBookHref(href: string) {
  try {
    return decodeURIComponent(href).replace(/^\.\//, '').replace(/^\//, '');
  } catch {
    return href.replace(/^\.\//, '').replace(/^\//, '');
  }
}

export function sameBookFile(left: string, right: string) {
  const a = normalizeBookHref(left.split('#')[0]);
  const b = normalizeBookHref(right.split('#')[0]);
  return a === b || a.endsWith('/' + b) || b.endsWith('/' + a);
}

export function chapterEntries(
  items: TocItem[],
  ancestors: string[] = [],
): Array<TocItem & { path: string[] }> {
  return items.flatMap((item) => [
    { ...item, path: [...ancestors, item.id] },
    ...chapterEntries(item.subitems ?? [], [...ancestors, item.id]),
  ]);
}

export function indexChapterDocument({
  document,
  href,
  sectionIndex,
  cfi,
  entries,
  previousPath,
}: {
  document: Document;
  href: string;
  sectionIndex: number;
  cfi?: string;
  entries: ReturnType<typeof chapterEntries>;
  previousPath: string[];
}) {
  const anchor = documentTextAnchor(document);
  let unsafe = false;
  const boundaries = entries
    .filter((entry) => sameBookFile(entry.href, href))
    .map((entry) => {
      const fragment = entry.href.split('#')[1];
      if (!fragment) return { offset: 0, entry };
      const element = document.getElementById(normalizeBookHref(fragment));
      if (!element) {
        unsafe = true;
        return { offset: anchor.text.length, entry };
      }
      const offset = anchor.positions.findIndex(
        ({ node }) => element.contains(node) || Boolean(element.compareDocumentPosition(node) & 4),
      );
      return { offset: offset < 0 ? anchor.text.length : offset, entry };
    })
    .sort((left, right) => left.offset - right.offset);
  let path = previousPath;
  let title = entries.find((entry) => entry.id === path.at(-1))?.label ?? '正文';
  const passages: BookPassage[] = [];
  const slices = [
    { offset: 0, entry: undefined },
    ...boundaries,
    { offset: anchor.text.length, entry: undefined },
  ];
  for (let index = 0; index < slices.length - 1; index++) {
    const start = slices[index];
    if (start.entry) {
      path = start.entry.path;
      title = start.entry.label;
    }
    const end = slices[index + 1].offset;
    for (let offset = start.offset; offset < end; offset += 1020) {
      const stop = Math.min(offset + 1200, end);
      const raw = anchor.text.slice(offset, stop);
      const leading = raw.length - raw.trimStart().length;
      const text = raw.trim();
      if (!text) continue;
      const range = textAnchorRange(
        document,
        anchor,
        offset + leading,
        offset + leading + text.length,
      );
      if (!range) continue;
      passages.push({
        id: `${sectionIndex}:${passages.length}`,
        chapter: title,
        href,
        sectionIndex,
        chunkIndex: passages.length,
        text,
        chapterIds: unsafe ? [] : [...path],
        cfi: joinIndir(cfi ?? fake.fromIndex(sectionIndex), fromRange(range)),
      });
      if (stop === end) break;
    }
  }
  return { passages, path: unsafe ? [] : path };
}
