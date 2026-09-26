import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BookResourceTitle } from './BookResourceTitle';

// Semi's barrel also imports Lottie; this editor does not render animations.
vi.mock('lottie-web', () => ({ default: { loadAnimation: vi.fn() } }));

const state = vi.hoisted(() => ({ pending: false, rename: vi.fn() }));
vi.mock('./useBookResources', () => ({ useBookResourcesContext: () => state }));
const resource = { imageId: 'image-id', title: '原标题', savedAt: 1, url: '/image.png' };

describe('资源标题编辑', () => {
  let root: ReturnType<typeof createRoot>;
  let container: HTMLDivElement;
  const input = () => container.querySelector('input')!;
  const title = () => container.querySelector<HTMLButtonElement>('.book-resource-title__trigger')!;
  const key = (element: Element, value: string) =>
    act(() => {
      element.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true }));
    });
  const fill = (value: string) =>
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
        input(),
        value,
      );
      input().dispatchEvent(new Event('input', { bubbles: true }));
    });
  const submit = () =>
    act(async () => {
      container
        .querySelector('form')!
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

  beforeEach(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    state.pending = false;
    state.rename.mockReset().mockResolvedValue(undefined);
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    act(() => root.render(<BookResourceTitle resource={resource} />));
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it('双击选中原标题，Escape 取消并恢复焦点，F2 可重新编辑', () => {
    act(() => {
      title().dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    });
    expect(input()).toHaveFocus();
    expect(input().selectionStart).toBe(0);
    expect(input().selectionEnd).toBe(resource.title.length);
    fill('未保存的标题');
    key(input(), 'Escape');
    expect(input()).toBeNull();
    expect(title()).toHaveFocus();
    key(title(), 'F2');
    expect(input()).toHaveValue('原标题');
    expect(state.rename).not.toHaveBeenCalled();
  });

  it('空白标题不能提交，保存失败保留草稿并允许重试', async () => {
    key(title(), 'Enter');
    fill('   ');
    await submit();
    expect(container.querySelector('[role="alert"]')).toHaveTextContent('标题不能为空');
    expect(state.rename).not.toHaveBeenCalled();
    fill('  新标题  ');
    state.rename.mockRejectedValueOnce(new Error('网络暂时不可用'));
    await submit();
    expect(input()).toHaveValue('  新标题  ');
    expect(container.querySelector('[role="alert"]')).toHaveTextContent('网络暂时不可用');
    await submit();
    expect(state.rename).toHaveBeenLastCalledWith('image-id', '新标题');
    expect(input()).toBeNull();
    expect(title()).toHaveFocus();
  });

  it('没有改动不发送请求，保存期间禁止重复提交或取消', async () => {
    key(title(), 'Enter');
    await submit();
    expect(state.rename).not.toHaveBeenCalled();
    key(title(), 'Enter');
    fill('新标题');
    state.pending = true;
    act(() => root.render(<BookResourceTitle resource={resource} />));
    expect(input()).toBeDisabled();
    key(input(), 'Escape');
    await submit();
    expect(input()).toBeInTheDocument();
    expect(state.rename).not.toHaveBeenCalled();
    expect(container.querySelector('button[type="submit"]')).toBeDisabled();
  });
});
