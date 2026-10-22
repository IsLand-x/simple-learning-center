import assert from 'node:assert/strict';
import test from 'node:test';
import { chapterPassages, findMindMapChapter, validateMindMapOutline, mindMapId } from './model.js';

const passages = [
  {
    id: '1:0',
    chapter: '第一章',
    href: 'one.xhtml',
    sectionIndex: 1,
    chapterIds: ['one', 'child'],
    cfi: 'trusted-cfi',
    text: '可靠性需要系统在出现故障时仍然继续正确运行。',
  },
  {
    id: '2:0',
    chapter: '第二章',
    href: 'two.xhtml',
    sectionIndex: 2,
    chapterIds: ['two'],
    cfi: 'other-cfi',
    text: '可维护性需要降低系统长期演进的复杂程度。',
  },
];
const book = {
  id: 'book',
  kind: 'epub',
  toc: [
    {
      id: 'one',
      label: '第一章',
      href: 'one.xhtml',
      subitems: [{ id: 'child', href: 'one.xhtml#child', label: '小节' }],
    },
    { id: 'two', label: '第二章', href: 'two.xhtml' },
  ],
};
const outline = (changes = {}) =>
  JSON.stringify({
    nodes: [
      {
        key: 'a',
        parent: null,
        title: '可靠性要求容忍故障',
        sources: [{ passageId: '1:0', quote: '可靠性需要系统在出现故障时仍然继续正确运行。' }],
        ...changes,
      },
    ],
  });

test('章节范围包含下属小节，引用只能解析到所选章节内的可信位置', () => {
  const scoped = chapterPassages(book, 'one', passages);
  assert.deepEqual(
    scoped.map((passage) => passage.id),
    ['1:0'],
  );
  assert.deepEqual(chapterPassages(book, 'child', passages), scoped);
  assert.throws(() => chapterPassages(book, 'missing', passages), /不属于/);
  const nodes = validateMindMapOutline(outline(), scoped, 'scope');
  assert.equal(nodes[0].sources[0].cfi, 'trusted-cfi');
  assert.equal(nodes[0].parentId, 'scope:root');
  assert.equal(nodes[0].id, validateMindMapOutline(outline(), scoped, 'scope')[0].id);
  assert.notEqual(mindMapId('a:b', 'c'), mindMapId('a', 'b:c'));
  assert.throws(
    () =>
      validateMindMapOutline(
        outline({ sources: [{ passageId: '2:0', quote: passages[1].text }] }),
        scoped,
        'scope',
      ),
    /无法核验/,
  );
  assert.throws(
    () =>
      validateMindMapOutline(
        outline({ sources: [{ passageId: '1:0', quote: '这句话并没有出现在原始文本中。' }] }),
        scoped,
        'scope',
      ),
    /无法核验/,
  );
  assert.throws(
    () => validateMindMapOutline(outline({ parent: 'a' }), scoped, 'scope'),
    /层级无效/,
  );
  assert.throws(
    () => validateMindMapOutline(outline({ parent: 'missing' }), scoped, 'scope'),
    /层级无效/,
  );
  assert.throws(() => validateMindMapOutline('not JSON', scoped, 'scope'), /有效的导图/);
});

test('过时索引与无定位的 EPUB 段落不能静默生成无法跳转的导图', () => {
  assert.throws(
    () =>
      chapterPassages(
        book,
        'one',
        passages.map(({ chapterIds: _ids, ...rest }) => rest),
      ),
    /定位的正文/,
  );
  assert.throws(
    () =>
      chapterPassages(
        book,
        'one',
        passages.map(({ cfi: _cfi, ...rest }) => rest),
      ),
    /定位索引/,
  );
});

test('旧 NCX 中重复的章节 ID 使用目录路径区分，不按同名标题覆盖', () => {
  const toc = [
    {
      id: 'toc-0',
      label: '同名章节',
      href: 'one',
      subitems: [{ id: 'toc-0', label: '同名章节', href: 'child' }],
    },
  ];
  assert.equal(findMindMapChapter(toc, 'toc-0'), undefined);
  assert.equal(findMindMapChapter(toc, 'toc:0:one').href, 'one');
  assert.equal(findMindMapChapter(toc, 'toc:0.0:child').href, 'child');
  assert.equal(findMindMapChapter(toc, 'toc:0.0:forged'), undefined);
});
