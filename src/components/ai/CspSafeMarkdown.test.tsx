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

it.each([
  String.raw`$$\boxed{R(\tau)=\tau\times B(\tau)}$$`,
  String.raw`\[\boxed{R(\tau)=\tau\times B(\tau)}\]`,
  String.raw`[ \boxed{R(\tau)=\tau\times B(\tau)} ]`,
])('将独立公式排版为可访问的带框数学表达式：%s', (content) => {
  const { container } = render(<CspSafeMarkdown content={content} />);
  expect(container.querySelector('.katex-display')).not.toBeNull();
  expect(container.querySelector('math')).not.toBeNull();
  expect(container.querySelector('annotation')?.textContent).toBe(
    String.raw`\boxed{R(\tau)=\tau\times B(\tau)}`,
  );
  expect(container.querySelector('.fbox')).not.toBeNull();
});

it('同时展示行内公式、分式、矩阵和普通 Markdown', () => {
  const { container } = render(
    <CspSafeMarkdown
      content={String.raw`行内 $x^2$ 与 \(a_i\)。

$$
\frac{1}{2}+\begin{bmatrix}a&b\\c&d\end{bmatrix}
$$

**说明**与[来源](https://example.com)`}
    />,
  );
  expect(container.querySelectorAll('.katex')).toHaveLength(3);
  expect(container.querySelectorAll('.katex-display')).toHaveLength(1);
  expect(container.querySelector('.mfrac')).not.toBeNull();
  expect(container.querySelector('strong')).toHaveTextContent('说明');
  expect(container.querySelector('a')).toHaveAttribute('href', 'https://example.com');
});

it('代码里的 LaTeX、链接和转义美元符号保持原样', () => {
  const content = [
    '代码 `' + String.raw`\[x^2\]` + '` 和价格 \\$10。',
    '',
    '~~~latex',
    String.raw`\[\frac{1}{2}\]`,
    '~~~',
    '',
    '[公式说明](https://example.com)',
    '',
    String.raw`    \[缩进代码\]`,
  ].join('\n');
  const { container } = render(<CspSafeMarkdown content={content} />);
  expect(container.querySelectorAll('.katex')).toHaveLength(0);
  expect(container.querySelectorAll('code')).toHaveLength(3);
  expect(container).toHaveTextContent('$10');
});

it('不完整流式公式保留原文，完成后正常排版，禁用危险 TeX 扩展', () => {
  const unfinished = render(<CspSafeMarkdown content={String.raw`\[\frac{1}{`} />);
  expect(unfinished.container).toHaveTextContent(String.raw`\frac{1}{`);
  const invalid = render(<CspSafeMarkdown content={String.raw`$$\frac{1}{$$`} />);
  expect(invalid.container.querySelector('.katex-error')).not.toBeNull();
  const unsafe = render(
    <CspSafeMarkdown
      content={String.raw`$\href{javascript:alert(1)}{点击}\includegraphics{https://example.com/private.png}$`}
    />,
  );
  expect(unsafe.container.querySelector('a, img, script')).toBeNull();
});
