import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeJobInput } from './startInput.js';

const request = {
  configId: 'config',
  model: 'model',
  bookId: 'book',
  conversationId: 'conversation',
  userMessage: { id: 'question', content: '问题' },
};

test('启动输入保持校验顺序，只在问题校验通过后生成消息时间', () => {
  const cases = [
    [undefined, '模型配置不正确'],
    [{ ...request, configId: '', model: '' }, '模型配置不正确'],
    [{ ...request, model: '', reasoningEffort: 'bad' }, '模型名称不正确'],
    [{ ...request, reasoningEffort: 'bad', bookId: '' }, '推理强度不正确'],
    [{ ...request, bookId: '', conversationId: '' }, '书籍不正确'],
    [{ ...request, conversationId: '', userMessage: undefined }, '对话不正确'],
    [{ ...request, userMessage: { id: '', content: '' } }, '消息不正确'],
    [{ ...request, userMessage: { id: 'question', content: '' } }, '问题内容不正确'],
  ];
  for (const [input, message] of cases) {
    assert.throws(() => normalizeJobInput(input, () => assert.fail('校验失败不能生成消息时间')), {
      status: 400,
      message,
    });
  }
});

test('书籍任务用途、默认推理强度、引用与内容裁剪保持一致', () => {
  for (const purpose of [undefined, 'unknown', 'chat', 'glossary', 'mindmap', 'chapter-video']) {
    let calls = 0;
    const input = normalizeJobInput({ ...request, purpose }, () => ++calls);
    assert.equal(input.purpose, purpose === undefined || purpose === 'unknown' ? 'chat' : purpose);
    assert.equal(input.createdAt, 1);
    assert.equal(calls, 1);
  }
  const input = normalizeJobInput(
    {
      ...request,
      reasoningEffort: 'auto',
      currentText: 'x'.repeat(30_001),
      userMessage: {
        id: ' question ',
        content: ' 问题 ',
        createdAt: 999_999,
        quote: { text: ' 原文 ', chapter: 'x'.repeat(501) },
      },
    },
    () => 100,
  );
  assert.equal(input.reasoningEffort, undefined);
  assert.equal(input.userMessageId, 'question');
  assert.equal(input.content, '问题');
  assert.equal(input.createdAt, 100);
  assert.deepEqual(input.quote, { text: '原文', chapter: 'x'.repeat(500) });
  assert.equal(input.currentText.length, 30_000);
});
