import { act, createElement, type ComponentProps } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { AiModelSelector } from './AiModelSelector';

const captured = vi.hoisted(() => ({ props: {} as { value?: string[]; treeData?: unknown } }));
vi.mock('@douyinfe/semi-ui', () => ({
  Cascader: (props: typeof captured.props) => {
    captured.props = props;
    return null;
  },
}));

it('keeps the controlled path stable during unrelated updates and updates real selections', async () => {
  const container = document.createElement('div');
  const root = createRoot(container);
  const props: ComponentProps<typeof AiModelSelector> = {
    configs: [
      {
        id: 'kimi',
        name: 'Kimi',
        models: ['kimi-coding'],
        baseUrl: '',
        apiKey: '',
        createdAt: 1,
        updatedAt: 1,
      },
    ],
    provider: 'api:kimi',
    model: 'kimi-coding',
    disabled: false,
    onChange: vi.fn(),
  };
  try {
    await act(async () => root.render(createElement(AiModelSelector, props)));
    const first = captured.props;
    await act(async () =>
      root.render(createElement(AiModelSelector, { ...props, className: 'updated' })),
    );
    expect(captured.props.value).toBe(first.value);
    expect(captured.props.treeData).toBe(first.treeData);
    await act(async () =>
      root.render(createElement(AiModelSelector, { ...props, configs: [...props.configs] })),
    );
    expect(captured.props.value).toBe(first.value);
    await act(async () =>
      root.render(
        createElement(AiModelSelector, { ...props, provider: 'api:codex', model: 'gpt-6.1-sol' }),
      ),
    );
    expect(captured.props.value).toEqual(['api:codex', 'gpt-6.1-sol']);
  } finally {
    await act(async () => root.unmount());
  }
});
