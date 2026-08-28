import ePub from 'epubjs';
import { demoChapterContent } from '../data/demo';
import type { BookItem, TocItem } from '../types';
import { loadBookSearchIndex, loadEpubFile, saveBookSearchIndex } from './epubStorage';

const INDEX_VERSION = 1;
const CHUNK_LENGTH = 1_200;
const CHUNK_OVERLAP = 180;

export interface BookPassage {
  id: string;
  chapter: string;
  href: string;
  sectionIndex: number;
  chunkIndex: number;
  text: string;
}

interface StoredBookSearchIndex {
  version: number;
  bookId: string;
  fileSize: number;
  passages: BookPassage[];
}

interface TocEntry {
  href: string;
  label: string;
}

const indexCache = new Map<string, Promise<BookPassage[]>>();

function normalizeText(value: string) {
  return value
    .replace(/\r/g, '')
    .replace(/[\t\f\v ]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function normalizeHref(value: string) {
  const href = value.split('#')[0].split('?')[0];
  try {
    return decodeURIComponent(href).replace(/^\.\//, '');
  } catch {
    return href.replace(/^\.\//, '');
  }
}

function flattenToc(items: TocItem[]): TocEntry[] {
  return items.flatMap((item) => [
    { href: normalizeHref(item.href), label: item.label },
    ...flattenToc(item.subitems ?? []),
  ]);
}

function chapterForHref(entries: TocEntry[], href: string, fallback: string) {
  const normalized = normalizeHref(href);
  const exact = entries.find((entry) => entry.href === normalized);
  if (exact) return exact.label;
  const suffix = entries.find((entry) => entry.href.endsWith(normalized) || normalized.endsWith(entry.href));
  return suffix?.label || fallback;
}

function splitLongSegment(segment: string) {
  if (segment.length <= CHUNK_LENGTH) return [segment];
  const chunks: string[] = [];
  let start = 0;
  while (start < segment.length) {
    const targetEnd = Math.min(start + CHUNK_LENGTH, segment.length);
    const punctuation = segment.slice(start, targetEnd).search(/[。！？!?；;]\s*$/);
    const end = punctuation >= 0 ? start + punctuation + 1 : targetEnd;
    chunks.push(segment.slice(start, end).trim());
    if (end >= segment.length) break;
    start = Math.max(start + 1, end - CHUNK_OVERLAP);
  }
  return chunks.filter(Boolean);
}

function chunkSection(text: string) {
  const segments = normalizeText(text)
    .split(/\n{2,}/)
    .flatMap(splitLongSegment)
    .filter(Boolean);
  const chunks: string[] = [];
  let current = '';

  segments.forEach((segment) => {
    if (!current) {
      current = segment;
      return;
    }
    if (current.length + segment.length + 2 <= CHUNK_LENGTH) {
      current += `\n\n${segment}`;
      return;
    }
    chunks.push(current);
    const overlap = current.slice(-CHUNK_OVERLAP).replace(/^.*?[。！？!?；;]\s*/, '').trim();
    current = overlap ? `${overlap}\n\n${segment}` : segment;
  });
  if (current) chunks.push(current);
  return chunks;
}

function passagesForSection({
  text,
  chapter,
  href,
  sectionIndex,
}: {
  text: string;
  chapter: string;
  href: string;
  sectionIndex: number;
}) {
  return chunkSection(text).map((chunk, chunkIndex): BookPassage => ({
    id: `${sectionIndex}:${chunkIndex}`,
    chapter,
    href,
    sectionIndex,
    chunkIndex,
    text: chunk,
  }));
}

function buildDemoPassages(book: BookItem) {
  return flattenToc(book.toc).flatMap((entry, sectionIndex) => {
    const content = demoChapterContent[normalizeHref(entry.href)];
    if (!content) return [];
    return passagesForSection({
      text: [content.heading, ...content.paragraphs].join('\n\n'),
      chapter: entry.label,
      href: entry.href,
      sectionIndex,
    });
  });
}

async function buildEpubPassages(book: BookItem) {
  const data = await loadEpubFile(book.id);
  if (!data) throw new Error('本地 EPUB 文件不存在，无法建立书籍搜索索引');
  const epub = ePub(data);
  const tocEntries = flattenToc(book.toc);
  try {
    await epub.ready;
    const spineItems = await epub.loaded.spine;
    const passages: BookPassage[] = [];
    for (let sectionIndex = 0; sectionIndex < spineItems.length; sectionIndex += 1) {
      const section = epub.section(sectionIndex);
      if (!section?.href) continue;
      try {
        const document = await Promise.resolve(section.load(epub.load.bind(epub))) as unknown as Document;
        const text = document.body?.innerText || document.documentElement?.textContent || '';
        if (!normalizeText(text)) continue;
        passages.push(...passagesForSection({
          text,
          chapter: chapterForHref(tocEntries, section.href, `第 ${sectionIndex + 1} 节`),
          href: section.href,
          sectionIndex,
        }));
      } finally {
        section.unload();
      }
    }
    return passages;
  } finally {
    epub.destroy();
  }
}

async function loadOrBuildIndex(book: BookItem) {
  const stored = await loadBookSearchIndex<StoredBookSearchIndex>(book.id);
  if (
    stored?.version === INDEX_VERSION
    && stored.bookId === book.id
    && stored.fileSize === book.fileSize
    && Array.isArray(stored.passages)
  ) {
    return stored.passages;
  }
  const passages = book.kind === 'demo' ? buildDemoPassages(book) : await buildEpubPassages(book);
  await saveBookSearchIndex(book.id, {
    version: INDEX_VERSION,
    bookId: book.id,
    fileSize: book.fileSize,
    passages,
  } satisfies StoredBookSearchIndex);
  return passages;
}

export function getBookPassages(book: BookItem) {
  const existing = indexCache.get(book.id);
  if (existing) return existing;
  const pending = loadOrBuildIndex(book).catch((error) => {
    indexCache.delete(book.id);
    throw error;
  });
  indexCache.set(book.id, pending);
  return pending;
}

function countOccurrences(text: string, query: string) {
  if (!query) return 0;
  let count = 0;
  let position = 0;
  while ((position = text.indexOf(query, position)) >= 0) {
    count += 1;
    position += Math.max(1, query.length);
  }
  return count;
}

function queryTerms(query: string) {
  const normalized = normalizeText(query).toLocaleLowerCase();
  const words = normalized.split(/[\s，。！？、；：,.!?;:()（）《》“”'"\[\]【】]+/).filter((term) => term.length > 1);
  const compact = normalized.replace(/\s+/g, '');
  const bigrams = /[\u3400-\u9fff]/.test(compact) && compact.length > 2
    ? Array.from({ length: compact.length - 1 }, (_, index) => compact.slice(index, index + 2))
    : [];
  return { normalized, terms: Array.from(new Set([...words, ...bigrams])).slice(0, 24) };
}

export async function searchBookContent(book: BookItem, query: string, maxResults = 6) {
  const cleanedQuery = normalizeText(query);
  if (!cleanedQuery) throw new Error('书内搜索词不能为空');
  const passages = await getBookPassages(book);
  const { normalized, terms } = queryTerms(cleanedQuery);
  const matches = passages
    .map((passage) => {
      const searchable = `${passage.chapter}\n${passage.text}`.toLocaleLowerCase();
      const exactMatches = countOccurrences(searchable, normalized);
      const termMatches = terms.reduce((sum, term) => sum + Math.min(4, countOccurrences(searchable, term)), 0);
      const coverage = terms.filter((term) => searchable.includes(term)).length;
      return { passage, score: exactMatches * 80 + termMatches * 4 + coverage * 8 };
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || left.passage.sectionIndex - right.passage.sectionIndex)
    .slice(0, Math.min(10, Math.max(1, maxResults)))
    .map(({ passage, score }) => ({
      passageId: passage.id,
      chapter: passage.chapter,
      href: passage.href,
      score,
      text: passage.text,
    }));
  return {
    book: book.title,
    query: cleanedQuery,
    indexedPassages: passages.length,
    matches,
  };
}

export async function readBookPassage(book: BookItem, passageId: string) {
  const passages = await getBookPassages(book);
  const index = passages.findIndex((passage) => passage.id === passageId);
  if (index < 0) throw new Error(`找不到书籍段落：${passageId}`);
  const passage = passages[index];
  const context = passages
    .slice(Math.max(0, index - 1), Math.min(passages.length, index + 2))
    .filter((item) => item.sectionIndex === passage.sectionIndex);
  return {
    book: book.title,
    passageId,
    chapter: passage.chapter,
    href: passage.href,
    text: context.map((item) => item.text).join('\n\n'),
  };
}
