import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { chapterEntries } from './AssistantPanel/chapterIndex';
import { ChapterSelect } from './ChapterSelect';

vi.mock('lottie-web', () => ({ default: { loadAnimation: vi.fn() } }));

it('重复标题与旧版重复 ID 的章节在受控选中和重新渲染时只勾选对应项', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const chapters = chapterEntries([
    { id: 'summary', label: '本章小结', href: 'one.xhtml#summary' },
    { id: 'summary', label: '本章小结', href: 'two.xhtml#summary' },
  ]);
  const onChange = vi.fn();
  const render = (value: string) =>
    act(async () =>
      root.render(
        createElement(ChapterSelect, {
          chapters,
          value,
          includeBook: true,
          id: 'test-chapter',
          label: '选择章节',
          onChange,
        }),
      ),
    );
  const click = async (element: Element) =>
    act(async () => {
      element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
  try {
    await render(chapters[1].id);
    await click(container.querySelector('#test-chapter')!);
    const options = [...document.querySelectorAll('[role="option"]')];
    expect(options).toHaveLength(3);
    expect(options.filter((option) => option.getAttribute('aria-selected') === 'true')).toEqual([
      options[2],
    ]);
    await render(chapters[0].id);
    const next = [...document.querySelectorAll('[role="option"]')];
    expect(next.filter((option) => option.getAttribute('aria-selected') === 'true')).toEqual([
      next[1],
    ]);
    await render(chapters[1].id);
    const restored = [...document.querySelectorAll('[role="option"]')];
    expect(restored.filter((option) => option.getAttribute('aria-selected') === 'true')).toEqual([
      restored[2],
    ]);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});
