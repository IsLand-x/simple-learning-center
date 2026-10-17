import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useModelDiscovery } from './useModelDiscovery';
import type { DiscoverModelsResponse } from '../../../../api/ai/type';

const mocks = vi.hoisted(() => ({ discover: vi.fn() }));
vi.mock('../../../../api/ai', () => ({ aiApi: { discoverModels: mocks.discover } }));

let root: Root;
let container: HTMLDivElement;
let state: ReturnType<typeof useModelDiscovery>;
function Probe({ url = 'https://provider.example/v1', apiKey = '', active = true }) {
  state = useModelDiscovery(url, apiKey, active);
  return null;
}
async function render(props = {}) {
  await act(async () => root.render(createElement(Probe, props)));
}
beforeEach(() => {
  vi.clearAllMocks();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe('模型列表检测请求生命周期', () => {
  it('只在显式检测时请求供应商，重复点击共享进行中的请求', async () => {
    let finish!: (value: DiscoverModelsResponse) => void;
    mocks.discover.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await render();
    expect(mocks.discover).not.toHaveBeenCalled();
    let pending!: Promise<DiscoverModelsResponse | null>;
    await act(async () => {
      pending = state.discover();
    });
    expect(state.busy).toBe(true);
    await act(async () => {
      expect(await state.discover()).toBeNull();
    });
    expect(mocks.discover).toHaveBeenCalledTimes(1);
    await act(async () => {
      finish({ baseUrl: 'https://provider.example/v1', models: ['model-a'] });
      await pending;
    });
    expect(state.result?.models).toEqual(['model-a']);
    expect(state.busy).toBe(false);
  });

  it.each([{ url: 'https://other.example/v1' }, { apiKey: 'new-test-key' }, { active: false }])(
    '变更配置或关闭编辑时取消旧请求：%s',
    async (props) => {
      let finish!: (value: DiscoverModelsResponse) => void;
      mocks.discover.mockImplementation(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      );
      await render();
      let pending!: Promise<DiscoverModelsResponse | null>;
      await act(async () => {
        pending = state.discover();
      });
      const signal = mocks.discover.mock.calls[0][1] as AbortSignal;
      await render(props);
      expect(signal.aborted).toBe(true);
      await act(async () => {
        finish({ baseUrl: 'https://provider.example/v1', models: ['stale'] });
        expect(await pending).toBeNull();
      });
      expect(state.result).toBeNull();
      expect(state.busy).toBe(false);
    },
  );

  it('失败后展示错误并可重试，卸载会取消正在进行的请求', async () => {
    mocks.discover
      .mockRejectedValueOnce(new Error('请检查 API Key'))
      .mockResolvedValueOnce({ baseUrl: 'https://provider.example/v1', models: ['model-a'] });
    await render();
    await act(async () => {
      await state.discover();
    });
    expect(state.error).toBe('请检查 API Key');
    await act(async () => {
      await state.discover();
    });
    expect(state.error).toBe('');
    expect(state.result?.models).toEqual(['model-a']);
    mocks.discover.mockImplementation(() => new Promise(() => {}));
    await act(async () => {
      void state.discover();
    });
    const signal = mocks.discover.mock.calls[2][1] as AbortSignal;
    await act(async () => root.unmount());
    expect(signal.aborted).toBe(true);
    root = createRoot(container);
  });
});
