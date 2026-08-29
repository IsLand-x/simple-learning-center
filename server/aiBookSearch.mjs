import { readFile } from 'node:fs/promises';
import { searchIndexPath } from './storage.mjs';

function normalizeText(value) {
  return String(value ?? '')
    .replace(/\r/g, '')
    .replace(/[\t\f\v ]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function loadBookPassages(book) {
  let stored;
  try {
    stored = JSON.parse(await readFile(searchIndexPath(book.id), 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw new Error('书内搜索索引尚未生成，请保持书籍页面打开并重新发送问题');
    }
    throw new Error('书内搜索索引无法读取');
  }
  if (
    stored?.version !== 2
    || stored.bookId !== book.id
    || stored.fileSize !== book.fileSize
    || !Array.isArray(stored.passages)
    || stored.passages.length === 0
  ) {
    throw new Error('书内搜索索引已经失效，请保持书籍页面打开并重新发送问题');
  }
  return stored.passages;
}

function countOccurrences(text, query) {
  if (!query) return 0;
  let count = 0;
  let position = 0;
  while ((position = text.indexOf(query, position)) >= 0) {
    count += 1;
    position += Math.max(1, query.length);
  }
  return count;
}

function queryTerms(query) {
  const normalized = normalizeText(query).toLocaleLowerCase();
  const words = normalized
    .split(/[\s，。！？、；：,.!?;:()（）《》“”'"\[\]【】]+/)
    .filter((term) => term.length > 1);
  const compact = normalized.replace(/\s+/g, '');
  const bigrams = /[\u3400-\u9fff]/.test(compact) && compact.length > 2
    ? Array.from({ length: compact.length - 1 }, (_, index) => compact.slice(index, index + 2))
    : [];
  return { normalized, terms: Array.from(new Set([...words, ...bigrams])).slice(0, 24) };
}

export async function searchBookContent(book, query, maxResults = 6) {
  const cleanedQuery = normalizeText(query);
  if (!cleanedQuery) throw new Error('书内搜索词不能为空');
  const passages = await loadBookPassages(book);
  const { normalized, terms } = queryTerms(cleanedQuery);
  const matches = passages
    .map((passage) => {
      const searchable = `${passage.chapter}\n${passage.text}`.toLocaleLowerCase();
      const exactMatches = countOccurrences(searchable, normalized);
      const termMatches = terms.reduce(
        (sum, term) => sum + Math.min(4, countOccurrences(searchable, term)),
        0,
      );
      const coverage = terms.filter((term) => searchable.includes(term)).length;
      return { passage, score: exactMatches * 80 + termMatches * 4 + coverage * 8 };
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => (
      right.score - left.score || left.passage.sectionIndex - right.passage.sectionIndex
    ))
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

export async function readBookPassage(book, passageId) {
  const passages = await loadBookPassages(book);
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
