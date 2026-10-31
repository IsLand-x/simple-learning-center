import { describe, expect, it } from 'vitest';
import { chapterEntries } from '../AssistantPanel/chapterIndex';
import type { ChapterVideo } from '../../../../../../contracts/reading';
import { chapterVideoParts, currentVideoChapter, describeChapterVideoScope } from './model';

describe('视频面板的当前大章预选', () => {
  const chapters = chapterEntries([
    {
      id: 'repeated',
      href: 'one.xhtml#chapter',
      label: '本章小结',
      subitems: [{ id: 'child', href: 'one.xhtml#section', label: '小节' }],
    },
    { id: 'repeated', href: 'two.xhtml#chapter', label: '本章小结' },
  ]);
  it('以实时阅读地址和稳定 ID 区分同名、重复出版 ID 的章节', () => {
    expect(currentVideoChapter(chapters, 'OEBPS/two.xhtml#chapter', '本章小结')).toBe(
      chapters[2].id,
    );
    expect(currentVideoChapter(chapters, 'one.xhtml#section', '小节')).toBe(chapters[0].id);
    expect(currentVideoChapter(chapters, 'OEBPS/two.xhtml#paragraph', '本章小结')).toBe(
      chapters[2].id,
    );
  });
  it('目录位置未就绪时仅使用唯一标题，不将重复标题猜成第一章', () => {
    expect(currentVideoChapter(chapters, undefined, '小节')).toBe(chapters[0].id);
    expect(currentVideoChapter(chapters, undefined, '本章小结')).toBeUndefined();
    expect(currentVideoChapter([], undefined, '')).toBeUndefined();
  });
});

describe('章节视频分 P 顺序', () => {
  const chapters = chapterEntries([
    { id: 'one', href: 'one.xhtml', label: '同名章节' },
    { id: 'two', href: 'two.xhtml', label: '同名章节' },
  ]);
  const video = (id: string, chapterId: string | undefined, generatedAt: number): ChapterVideo => ({
    id,
    chapterId,
    generatedAt,
    version: 1,
    bookId: 'book',
    chapterTitle: '同名章节',
    title: '课程',
    summary: '摘要',
    scenes: [],
    durationSeconds: 60,
    hasAudio: true,
    model: 'test',
  });
  it('导读在前，其余按目录稳定 ID 排列，同名章节不合并，未生成章节不造分 P', () => {
    const videos = [
      video('second', 'two', 50),
      video('intro', undefined, 10),
      video('first', 'one', 20),
    ];
    expect(chapterVideoParts(videos, chapters).map((item) => item.id)).toEqual([
      'intro',
      'first',
      'second',
    ]);
    expect(videos.map((item) => item.id)).toEqual(['second', 'intro', 'first']);
    expect(chapterVideoParts([videos[0]], chapters).map((item) => item.id)).toEqual(['second']);
  });
  it('同一范围只用最新成功视频，兼容目录中已不存在的历史范围', () => {
    const videos = [
      video('old', 'one', 10),
      video('new', 'one', 30),
      video('legacy', 'missing', 40),
    ];
    expect(chapterVideoParts(videos, chapters).map((item) => item.id)).toEqual(['new', 'legacy']);
    expect(chapterVideoParts([], chapters)).toEqual([]);
  });
});

describe('生成视频弹窗的章节与视频说明', () => {
  const toc = [
    {
      id: 'c1',
      href: 'c1.xhtml',
      label: '第一大章',
      subitems: [
        { id: 'c1-1', href: 'c1.xhtml#1', label: '1.1 核心问题' },
        { id: 'c1-2', href: 'c1.xhtml#2', label: '1.2 推导机制' },
      ],
    },
    { id: 'c2', href: 'c2.xhtml', label: '第二大章' },
  ];
  const chapters = chapterEntries(toc);

  it('选中大章时列出本章及全部下属小节，选中全书导读时列出全书各章', () => {
    const chapterScope = describeChapterVideoScope(toc, chapters, chapters[0].id);
    expect(chapterScope.scopeTitle).toBe('第一大章');
    expect(chapterScope.includedChapters).toEqual(['第一大章', '1.1 核心问题', '1.2 推导机制']);
    expect(chapterScope.scopeSummary).toContain('下属 2 个小节');

    const bookScope = describeChapterVideoScope(toc, chapters, undefined);
    expect(bookScope.scopeTitle).toBe('全书导读');
    expect(bookScope.includedChapters).toEqual(['第一大章', '第二大章']);
    expect(bookScope.scopeSummary).toContain('覆盖全书 2 个大章');
  });
});
