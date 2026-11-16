import { expect, it, vi } from 'vitest';
import type { View as FoliateView } from 'foliate-js/view.js';
import { locateMindMapSource } from './mindMapNavigation';

const navigate = vi.hoisted(() => vi.fn());
vi.mock('./tocNavigation', () => ({ navigateToFoliateTarget: navigate }));

it('讨论没有引用文字时优先按 CFI 定位，并支持仅有章节 href 的记录', async () => {
  navigate.mockResolvedValue(true);
  const view = {} as FoliateView;
  const source = { passageId: '', chapter: '第一章', href: 'chapter.xhtml', quote: '' };
  await locateMindMapSource(view, { ...source, cfi: 'epubcfi(/6/2!/4/2)' });
  expect(navigate).toHaveBeenLastCalledWith(view, 'epubcfi(/6/2!/4/2)');
  await locateMindMapSource(view, source);
  expect(navigate).toHaveBeenLastCalledWith(view, 'chapter.xhtml');
  navigate.mockResolvedValue(false);
  await expect(locateMindMapSource(view, source)).rejects.toThrow('无法跳转');
});
