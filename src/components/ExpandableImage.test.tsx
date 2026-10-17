import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { ExpandableImage } from './ExpandableImage';

vi.mock('lottie-web', () => ({ default: { loadAnimation: vi.fn() } }));

describe('图片加载反馈', () => {
  it('按原图比例占位，加载完成后显示图片，切换图片时重新进入 loading', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const container = document.createElement('div');
    const root = createRoot(container);
    try {
      await act(async () =>
        root.render(
          <ExpandableImage
            src="/first.png"
            alt="测试图"
            dimensions={{ width: 900, height: 1350 }}
          />,
        ),
      );
      expect(container.querySelector('[role="status"]')).toHaveTextContent('图片加载中');
      expect(container.querySelector('button')).toBeDisabled();
      expect(container.querySelector('.expandable-image__frame')).toHaveStyle({
        aspectRatio: '900 / 1350',
      });
      const image = container.querySelector('img')!;
      Object.defineProperties(image, {
        naturalWidth: { value: 900 },
        naturalHeight: { value: 1350 },
      });
      await act(async () => {
        image.dispatchEvent(new Event('load'));
      });
      expect(container.querySelector('[role="status"]')).toBeNull();
      expect(container.querySelector('button')).not.toBeDisabled();
      expect(image).not.toHaveClass('invisible');
      await act(async () => root.render(<ExpandableImage src="/second.png" alt="第二张" />));
      expect(container.querySelector('[role="status"]')).not.toBeNull();
      expect(container.querySelector('button')).toBeDisabled();
    } finally {
      await act(async () => root.unmount());
      vi.unstubAllGlobals();
    }
  });

  it('失败后提供可点击重试，重试期间恢复 loading 并保留比例', async () => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const container = document.createElement('div');
    const root = createRoot(container);
    try {
      await act(async () =>
        root.render(<ExpandableImage src="/image.png" dimensions={{ width: 1200, height: 720 }} />),
      );
      const first = container.querySelector('img')!;
      await act(async () => {
        first.dispatchEvent(new Event('error'));
      });
      expect(container.querySelector('[role="alert"]')).toHaveTextContent('图片加载失败，点击重试');
      const button = container.querySelector('button')!;
      expect(button).toHaveAccessibleName('重试加载图片：图片');
      expect(button).not.toBeDisabled();
      await act(async () => {
        button.click();
      });
      expect(container.querySelector('[role="status"]')).not.toBeNull();
      expect(container.querySelector('img')).not.toBe(first);
      expect(container.querySelector('.expandable-image__frame')).toHaveStyle({
        aspectRatio: '1200 / 720',
      });
      expect(button).toBeDisabled();
    } finally {
      await act(async () => root.unmount());
      vi.unstubAllGlobals();
    }
  });
});
