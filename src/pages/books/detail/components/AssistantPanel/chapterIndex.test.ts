import { describe, expect, it } from 'vitest';
import { collapse, compare, parse } from 'foliate-js/epubcfi.js';
import { chapterEntries, indexChapterDocument } from './chapterIndex';

describe('章节正文索引', () => {
  it('同一 XHTML 中的章节边界和子章节准确分离，保留跨文件的父章节', () => {
    const entries = chapterEntries([
      {
        id: 'one',
        href: 'book.xhtml#one',
        label: '第一章',
        subitems: [{ id: 'child', href: 'book.xhtml#child', label: '小节' }],
      },
      { id: 'two', href: 'book.xhtml#two', label: '第二章' },
    ]);
    const doc = new DOMParser().parseFromString(
      '<h1 id="one">第一章</h1><p>开头的独立观点</p><h2 id="child">小节</h2><p>第一章的小节观点</p><h1 id="two">第二章</h1><p>第二章的独立观点</p>',
      'text/html',
    );
    const indexed = indexChapterDocument({
      document: doc,
      href: 'OEBPS/book.xhtml',
      sectionIndex: 0,
      entries,
      previousPath: [],
    });
    const first = indexed.passages.filter((passage) => passage.chapterIds?.includes('one'));
    expect(first.map((passage) => passage.text).join('')).toContain('第一章的小节观点');
    expect(first.map((passage) => passage.text).join('')).not.toContain('第二章');
    expect(
      indexed.passages
        .filter((passage) => passage.chapterIds?.includes('child'))
        .map((passage) => passage.text)
        .join(''),
    ).not.toContain('开头');
    expect(first.every((passage) => passage.cfi?.startsWith('epubcfi('))).toBe(true);
    expect(
      compare(collapse(parse(first[0].cfi!)), collapse(parse(first.at(-1)!.cfi!))),
    ).toBeLessThanOrEqual(0);
    const next = indexChapterDocument({
      document: new DOMParser().parseFromString('<p>第二章的后续文件</p>', 'text/html'),
      href: 'next.xhtml',
      sectionIndex: 1,
      entries,
      previousPath: indexed.path,
    });
    expect(next.passages[0].chapterIds).toEqual(['two']);
  });

  it('目录锚点无法解析时不猜测章节范围', () => {
    const indexed = indexChapterDocument({
      document: new DOMParser().parseFromString('<p>正文</p>', 'text/html'),
      href: 'one.xhtml',
      sectionIndex: 0,
      entries: chapterEntries([{ id: 'one', href: 'one.xhtml#missing', label: '第一章' }]),
      previousPath: [],
    });
    expect(indexed.passages[0].chapterIds).toEqual([]);
  });
});
