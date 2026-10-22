import { makeBook } from 'foliate-js/view.js?learning-center-srcdoc-v1';
import { booksApi } from '../../../../../api/books/index';
import { readingApi } from '../../../../../api/reading/index';
import type {
  BookPassage,
  BookSearchIndex as StoredBookSearchIndex,
} from '../../../../../api/reading/type';
import type { BookItem } from '../../../../../../contracts/books';
import { chapterEntries, indexChapterDocument } from './chapterIndex';
import { demoChapterContent } from '../../../../../util/fixtures/demo';

const INDEX_VERSION = 3;
const CHUNK_LENGTH = 1_200;
const CHUNK_OVERLAP = 180;

const indexCache = new Map<string, Promise<BookPassage[]>>();

function normalizeText(value: string) {
  return value.replace(/\s+/g, ' ').trim();
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
    const overlap = current
      .slice(-CHUNK_OVERLAP)
      .replace(/^.*?[。！？!?；;]\s*/, '')
      .trim();
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
  return chapterEntries(book.toc).flatMap((entry, sectionIndex) => {
    const content = demoChapterContent[entry.href.split('#')[0]];
    if (!content) return [];
    return passagesForSection({
      text: [content.heading, ...content.paragraphs].join('\n\n'),
      chapter: entry.label,
      href: entry.href,
      sectionIndex,
    }).map((passage) => ({ ...passage, chapterIds: entry.path }));
  });
}

async function buildEpubPassages(book: BookItem) {
  const data = await booksApi.loadEpubFile(book.id);
  if (!data) throw new Error('本地 EPUB 文件不存在，无法建立书籍搜索索引');
  const file = new File([data], book.fileName || `${book.title}.epub`, {
    type: 'application/epub+zip',
  });
  const epub = await makeBook(file);
  const tocEntries = chapterEntries(book.toc);
  try {
    const passages: BookPassage[] = [];
    let previousPath: string[] = [];
    for (let sectionIndex = 0; sectionIndex < epub.sections.length; sectionIndex += 1) {
      const section = epub.sections[sectionIndex];
      if (!section?.id || !section.createDocument) continue;
      try {
        const document = await section.createDocument();
        const indexed = indexChapterDocument({
          document,
          href: section.id,
          sectionIndex,
          cfi: section.cfi,
          entries: tocEntries,
          previousPath,
        });
        passages.push(...indexed.passages);
        previousPath = indexed.path;
      } catch {
        previousPath = [];
        // Image-only or malformed spine items have no searchable text; keep indexing the remaining book.
      } finally {
        section.unload?.();
      }
    }
    if (!passages.length) {
      throw new Error('未能从 EPUB 中提取可搜索正文，请确认书籍包含可选择的文字内容');
    }
    return passages;
  } finally {
    epub.destroy?.();
  }
}

async function loadOrBuildIndex(book: BookItem) {
  const stored = await readingApi.loadSearchIndex(book.id);
  if (
    stored?.version === INDEX_VERSION &&
    stored.bookId === book.id &&
    stored.fileSize === book.fileSize &&
    Array.isArray(stored.passages) &&
    stored.passages.length > 0
  ) {
    return stored.passages;
  }
  const passages = book.kind === 'demo' ? buildDemoPassages(book) : await buildEpubPassages(book);
  await readingApi.saveSearchIndex(book.id, {
    version: INDEX_VERSION,
    bookId: book.id,
    fileSize: book.fileSize,
    passages,
  } satisfies StoredBookSearchIndex);
  return passages;
}

export function getBookPassages(book: BookItem) {
  const existing = indexCache.get(`${book.id}:${book.fileSize}`);
  if (existing) return existing;
  const pending = loadOrBuildIndex(book).catch((error) => {
    indexCache.delete(`${book.id}:${book.fileSize}`);
    throw error;
  });
  indexCache.set(`${book.id}:${book.fileSize}`, pending);
  return pending;
}
