import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
vi.mock('lottie-web', () => ({ default: { loadAnimation: vi.fn() } }));
const render = (element: React.ReactElement) => {
  const container = document.createElement('div');
  container.innerHTML = renderToStaticMarkup(element);
  return { container };
};
import { CspSafeMarkdown } from './CspSafeMarkdown';

it('兼容中文标点和内侧空格的加粗，同时保留标准 Markdown', () => {
  const { container } = render(
    <CspSafeMarkdown
      content={
        '**统计分类： **属于就业人口。\n\n所以，**这个定义适合统计类别，大家过得好不好。**评价就业状况。\n\n**标准粗体**\n\n- 列表\n\n[来源](https://example.com)'
      }
    />,
  );
  expect([...container.querySelectorAll('strong')].map((node) => node.textContent)).toEqual([
    '统计分类：',
    '这个定义适合统计类别，大家过得好不好。',
    '标准粗体',
  ]);
  expect(container.querySelector('li')).toHaveTextContent('列表');
  expect(container.querySelector('a')).toHaveAttribute('href', 'https://example.com');
});
it('代码块、行内代码、转义和未闭合标记保持原样', () => {
  const { container } = render(
    <CspSafeMarkdown
      content={'`**代码： **`\n\n```md\n**代码块： **\n```\n\n\\*\\*原样： \\*\\*\n\n**尚未结束'}
    />,
  );
  expect(container.querySelectorAll('strong')).toHaveLength(0);
  expect(container.querySelector('code')).toHaveTextContent('**代码： **');
  expect(container).toHaveTextContent('**尚未结束');
});
