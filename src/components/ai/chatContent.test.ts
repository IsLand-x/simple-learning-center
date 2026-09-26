import { describe, expect, it } from 'vitest';
import { parseChatItem } from './chatContent';

describe('聊天内容渲染契约', () => {
  it('空内容与不支持的项不遮住加载状态', () => {
    for (const item of [
      null,
      1,
      { type: 'unknown' },
      { type: 'message', content: [] },
      { type: 'reasoning', summary: [] },
    ]) {
      expect(parseChatItem(item, 0)).toBeNull();
    }
  });

  it('保留混合文本、拒绝信息和真实推理过程的顺序', () => {
    expect(
      parseChatItem(
        { type: 'message', content: [{ text: '第一段' }, { refusal: '无法完成' }, null] },
        2,
      ),
    ).toEqual({ kind: 'markdown', text: '第一段\n\n无法完成', key: 'message-2' });
    expect(
      parseChatItem(
        {
          type: 'reasoning',
          status: 'in_progress',
          summary: [{ text: '摘要' }],
          content: [{ text: '过程' }],
        },
        3,
      ),
    ).toEqual({
      kind: 'reasoning',
      text: '摘要\n\n过程',
      status: 'in_progress',
      key: 'reasoning-3',
    });
  });

  it('没有正文的工具调用仍显示真实调用状态与参数', () => {
    expect(
      parseChatItem(
        {
          type: 'function_call',
          name: 'search_book',
          arguments: '{"query":"阅读"}',
          status: 'failed',
        },
        4,
      ),
    ).toEqual({
      kind: 'tool',
      name: 'search_book',
      argumentsText: '{"query":"阅读"}',
      status: 'failed',
      key: 'tool-4',
    });
  });
});
