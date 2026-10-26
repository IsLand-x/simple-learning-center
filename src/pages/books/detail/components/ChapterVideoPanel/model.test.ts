import { describe, expect, it } from 'vitest';
import { chapterEntries } from '../AssistantPanel/chapterIndex';
import { currentVideoChapter } from './model';

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
