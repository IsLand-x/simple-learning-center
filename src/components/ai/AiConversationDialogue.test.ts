import { act, createElement, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AiConversationDialogue } from './AiConversationDialogue';

const mocks = vi.hoisted(() => ({ markdown: vi.fn(), dialogue: vi.fn() }));
vi.mock('react-markdown', () => ({
  default: ({ children }: { children: string }) => {
    mocks.markdown(children);
    return createElement('p', null, children);
  },
}));
vi.mock('@douyinfe/semi-ui', () => ({
  Empty: () => null,
  AIChatDialogue: ({
    chats = [],
    dialogueRenderConfig,
  }: ComponentProps<typeof import('@douyinfe/semi-ui').AIChatDialogue>) => {
    mocks.dialogue();
    return createElement(
      'div',
      { className: 'semi-ai-chat-dialogue-list' },
      chats.map((message) =>
        createElement(
          'div',
          { key: message.id },
          dialogueRenderConfig?.renderDialogueContent?.({ message, className: 'bubble' }),
        ),
      ),
    );
  },
}));

type Chats = ComponentProps<typeof AiConversationDialogue>['chats'];
let root: Root;
let container: HTMLDivElement;
const history: Chats = Array.from({ length: 30 }, (_, index) => ({
  id: `history-${index}`,
  role: index % 2 ? 'assistant' : 'user',
  content: `历史消息 ${index}`,
  status: 'completed',
}));
async function render(chats: Chats) {
  await act(async () =>
    root.render(
      createElement(AiConversationDialogue, {
        chats,
        assistantName: '测试模型',
        emptyTitle: '开始对话',
        emptyDescription: '',
      }),
    ),
  );
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks();
  container = document.createElement('div');
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
});

it('流式输出只解析变化的 Markdown，保留历史消息和已完成的思考片段', async () => {
  for (let index = 0; index <= 20; index += 1) {
    await render([
      ...history.map((message) => ({ ...message })),
      {
        id: 'streaming',
        role: 'assistant',
        status: 'in_progress',
        content: [
          { type: 'reasoning', status: 'completed', summary: [{ text: '已有的思考过程' }] },
          { type: 'message', content: `当前回答 ${index}` },
        ],
      },
    ]);
  }
  expect(mocks.markdown.mock.calls.filter(([text]) => text.startsWith('历史消息'))).toHaveLength(
    30,
  );
  expect(mocks.markdown.mock.calls.filter(([text]) => text === '已有的思考过程')).toHaveLength(1);
  expect(container).toHaveTextContent('当前回答 20');
});

it('输入等无关更新不重新渲染消息列表', async () => {
  await render(history);
  const renders = mocks.dialogue.mock.calls.length;
  await render(history);
  expect(mocks.dialogue).toHaveBeenCalledTimes(renders);
});

it('内容不变时仍显示真实的任务状态和更新后的引用', async () => {
  const message = { id: 'pending', role: 'assistant', content: '' };
  await render([{ ...message, status: 'queued' }]);
  expect(container.querySelector('[aria-label="正在生成"]')).not.toBeNull();
  await render([{ ...message, status: 'failed' }]);
  expect(container.querySelector('[aria-label="正在生成"]')).toBeNull();
  expect(container.querySelector('.semi-ai-chat-dialogue-content-failed')).not.toBeNull();
  await render([
    {
      ...message,
      status: 'completed',
      content: '回答',
      quote: { text: '原文', chapter: '第一章' },
    },
  ]);
  expect(container.querySelector('.ai-message-quote')).toHaveTextContent('原文');
  await render([
    {
      ...message,
      status: 'completed',
      content: '回答',
      quote: { text: '新原文', chapter: '第二章' },
    },
  ]);
  expect(container.querySelector('.ai-message-quote')).toHaveTextContent('第二章新原文');
});

it('浏览历史时保持滚动位置，新消息到来才恢复跟随', async () => {
  await render(history);
  const list = container.querySelector<HTMLElement>('.semi-ai-chat-dialogue-list')!;
  Object.defineProperties(list, { scrollHeight: { value: 1000 }, clientHeight: { value: 200 } });
  list.scrollTop = 100;
  list.dispatchEvent(new Event('scroll'));
  await render(
    history.map((message, index) => (index === 29 ? { ...message, content: '更新回答' } : message)),
  );
  expect(list.scrollTop).toBe(100);
  await render([...history, { id: 'new', role: 'user', content: '继续提问', status: 'completed' }]);
  expect(list.scrollTop).toBe(1000);
});
