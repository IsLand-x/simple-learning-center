import { describe, expect, it } from 'vitest';
import type { HighlightItem } from '../../../../../contracts/reading';
import { sortAnnotations } from './annotationSorting';

function annotation(id: string, cfi: string, createdAt: number): HighlightItem {
  return { id, cfi, createdAt, updatedAt: createdAt, bookId: 'book', chapter: '', text: id };
}
const ids = (items: HighlightItem[]) => items.map((item) => item.id);

describe('阅读侧栏排序', () => {
  it('按创建时间正反排序，编辑时间不影响顺序，且不修改原数组', () => {
    const oldest = { ...annotation('old', '', 10), updatedAt: 100, commentUpdatedAt: 100 };
    const items = [annotation('middle', '', 20), oldest, annotation('new', '', 30)];
    expect(ids(sortAnnotations(items, 'created-desc'))).toEqual(['new', 'middle', 'old']);
    expect(ids(sortAnnotations(items, 'created-asc'))).toEqual(['old', 'middle', 'new']);
    expect(ids(items)).toEqual(['middle', 'old', 'new']);
  });

  it('跨章节、元素和文字偏移按数值比较 CFI，忽略断言中的数字', () => {
    const items = [
      annotation('chapter-10', 'epubcfi(/6/10[chapter-1]!/4/2/1:0)', 1),
      annotation('offset-10', 'epubcfi(/6/2[chapter-99]!/4/2/1:10)', 2),
      annotation('element-10', 'epubcfi(/6/2[chapter-99]!/4/10/1:0)', 3),
      annotation('offset-2', 'epubcfi(/6/2[chapter-99]!/4/2/1:2)', 4),
    ];
    expect(ids(sortAnnotations(items, 'position'))).toEqual([
      'offset-2',
      'offset-10',
      'element-10',
      'chapter-10',
    ]);
  });

  it('范围使用起点排序，相同位置按添加时间正序稳定排列', () => {
    const items = [
      annotation('later', 'epubcfi(/6/2!/4/2,/1:20,/1:30)', 1),
      annotation('same-newer', 'epubcfi(/6/2!/4/2,/1:2,/1:3)', 4),
      annotation('same-older', 'epubcfi(/6/2!/4/2,/1:2,/1:100)', 3),
      annotation('first', 'epubcfi(/6/2!/4/2/1:1)', 2),
    ];
    expect(ids(sortAnnotations(items, 'position'))).toEqual([
      'first',
      'same-older',
      'same-newer',
      'later',
    ]);
  });

  it('缺失或无效位置置后，不用可能失效的页码替代 CFI', () => {
    const items = [
      { ...annotation('missing', '', 1), page: 1 },
      annotation('invalid', 'epubcfi(/bad)', 2),
      annotation('broken-range', 'epubcfi(/6/2!,/1:)', 3),
      { ...annotation('valid', 'epubcfi(/6/10!/4/2/1:2)', 4), page: 100 },
    ];
    expect(ids(sortAnnotations(items, 'position'))).toEqual([
      'valid',
      'missing',
      'invalid',
      'broken-range',
    ]);
  });

  it('演示书籍同样按章节、段落和文字偏移数值排序', () => {
    const items = [
      annotation('chapter-10', 'demo:chapter-10:selection:0:0', 1),
      annotation('paragraph-10', 'demo:chapter-2:selection:10:0', 2),
      annotation('offset-10', 'demo:chapter-2:selection:2:10', 3),
      annotation('offset-2', 'demo:chapter-2:selection:2:2', 4),
    ];
    expect(ids(sortAnnotations(items, 'position'))).toEqual([
      'offset-2',
      'offset-10',
      'paragraph-10',
      'chapter-10',
    ]);
    expect(sortAnnotations([], 'position')).toEqual([]);
  });
});
