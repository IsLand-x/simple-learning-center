import { describe, expect, it, vi } from 'vitest';
import type { View } from 'foliate-js/view.js';
import type { HighlightItem } from '../../../../../../../contracts/reading';
import { findTermRanges, loadedAnnotations } from './termAnnotations';

const term = (text: string, id = text): HighlightItem => ({
  id,
  bookId: 'book',
  kind: 'term',
  text,
  cfi: 'original',
  chapter: '一',
  createdAt: 1,
  updatedAt: 1,
});
function chapter(html: string) {
  const doc = document.implementation.createHTMLDocument();
  doc.body.innerHTML = html;
  return doc;
}
describe('loaded term annotations', () => {
  it('matches every occurrence across inline nodes without changing the EPUB DOM or crossing paragraphs', () => {
    const doc = chapter('<p>术<em>语</em>，术语</p><p>术</p><p>语</p><script>术语</script>');
    const before = doc.body.innerHTML;
    const matches = findTermRanges(doc, [term('术语')]);
    expect(matches.map((match) => match.range.toString())).toEqual(['术语', '术语']);
    expect(doc.body.innerHTML).toBe(before);
  });
  it('escapes punctuation, handles whitespace, word boundaries and longest overlapping terms', () => {
    const doc = chapter('<p>C++ C++17 art partial art. 机器学习 机器 deep\n <em>learning</em></p>');
    const matches = findTermRanges(doc, [
      term('C++'),
      term('art'),
      term('机器'),
      term('机器学习'),
      term('deep learning'),
    ]);
    expect(matches.map((match) => match.range.toString())).toEqual([
      'deep\n learning',
      '机器学习',
      'C++',
      'C++',
      'art',
      'art',
      '机器',
    ]);
  });
  it('scans only the loaded chapter, caches stable CFIs and invalidates on deletion', () => {
    const doc = chapter('<p>术语 术语</p>');
    const getCFI = vi.fn((_index: number, range: Range) => `cfi:${range.startOffset}`);
    const view = {
      renderer: { getContents: () => [{ index: 2, doc }] },
      getCFI,
      resolveNavigation: () => ({ index: 2 }),
    } as unknown as View;
    const first = loadedAnnotations(view, 2, [term('术语')]);
    expect(first.map((item) => item.cfi)).toEqual(['cfi:0', 'cfi:3']);
    expect(first.every((item) => item.id === '术语')).toBe(true);
    loadedAnnotations(view, 2, [term('术语')]);
    expect(getCFI).toHaveBeenCalledTimes(2);
    expect(loadedAnnotations(view, 1, [term('术语')])).toEqual([]);
    expect(loadedAnnotations(view, 2, [])).toEqual([]);
  });
});
