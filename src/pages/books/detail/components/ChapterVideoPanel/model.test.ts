import { describe, expect, it } from 'vitest';
import { chapterEntries } from '../AssistantPanel/chapterIndex';
import type { ChapterVideo } from '../../../../../../contracts/reading';
import { chapterVideoParts, currentVideoChapter } from './model';

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
