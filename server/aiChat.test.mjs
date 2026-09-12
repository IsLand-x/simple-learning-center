import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createModels,
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall,
} from '@earendil-works/pi-ai';
import { createOpenAICompatiblePiRuntime, runServerAiChat } from './aiChat.mjs';

function runtimeFactoryFor(faux) {
  const models = createModels();
  models.setProvider(faux.provider);
  return () => ({ models, model: faux.getModel() });
}

test('OpenAI Compatible 配置通过 Pi Models 注册 Provider 与模型', async () => {
  const runtime = createOpenAICompatiblePiRuntime(
    {
      id: 'provider-a',
      name: '测试供应商',
      baseUrl: 'https://example.invalid/v1/chat/completions',
    },
    'mock-model',
  );

  assert.equal(runtime.model.provider, 'learning-center:provider-a');
  assert.equal(runtime.model.baseUrl, 'https://example.invalid/v1');
  assert.equal(runtime.model.api, 'openai-completions');
  const auth = await runtime.models.getAuth(runtime.model, { apiKey: 'test-key' });
  assert.equal(auth?.auth.apiKey, 'test-key');
});

test('PiAgent 通过 OpenAI 兼容端点流式返回对话', async () => {
  const faux = fauxProvider({ tokensPerSecond: 0 });
  let requestContext;
  let requestOptions;
  faux.setResponses([
    (context, options) => {
      requestContext = context;
      requestOptions = options;
      return fauxAssistantMessage('你好，读者。');
    },
  ]);

  const progress = [];
  const result = await runServerAiChat({
    config: { baseUrl: 'https://example.invalid/v1', apiKey: 'test-key' },
    model: 'mock',
    conversationId: 'conversation-a',
    messages: [{ role: 'user', content: '打个招呼', createdAt: 1 }],
    resourceType: 'book',
    book: {
      id: 'book-a',
      title: '测试书',
      author: '作者',
      progress: 10,
      currentChapter: '第一章',
      toc: [],
    },
    currentText: '',
    notes: [],
    highlights: [],
    readingSessions: [],
    webSearchConfig: {},
    assistantPrompt: '请使用苏格拉底式提问，并保持简洁。',
    signal: new AbortController().signal,
    onProgress: (value) => progress.push(value),
    runtimeFactory: runtimeFactoryFor(faux),
  });

  assert.equal(result.content, '你好，读者。');
  assert.ok(progress.length > 0);
  assert.ok(requestContext.tools.some((item) => item.name === 'read_current_book'));
  assert.ok(requestContext.tools.some((item) => item.name === 'create_book_note'));
  assert.ok(requestContext.tools.some((item) => item.name === 'update_book_note'));
  assert.match(requestContext.systemPrompt, /你是个人学习中心里的阅读助手/);
  assert.match(requestContext.systemPrompt, /优先级低于以上规则/);
  assert.match(requestContext.systemPrompt, /请使用苏格拉底式提问，并保持简洁/);
  assert.ok(
    requestContext.systemPrompt.indexOf('你是个人学习中心里的阅读助手') <
      requestContext.systemPrompt.indexOf('请使用苏格拉底式提问'),
  );
  assert.equal(requestOptions.sessionId, 'conversation-a');
});

test('PiAgent 将所选推理强度传给每轮模型请求', async () => {
  const faux = fauxProvider({ tokensPerSecond: 0 });
  const requestOptions = [];
  faux.setResponses([
    (context, options) => {
      requestOptions.push(options);
      return fauxAssistantMessage('已完成高强度推理。');
    },
  ]);

  await runServerAiChat({
    config: { baseUrl: 'https://api.deepseek.com', apiKey: 'test-key' },
    model: 'deepseek-v4-flash',
    reasoningEffort: 'high',
    conversationId: 'conversation-reasoning',
    messages: [{ role: 'user', content: '分析这个问题', createdAt: 1 }],
    resourceType: 'book',
    book: {
      id: 'book-a',
      title: '测试书',
      author: '作者',
      progress: 10,
      currentChapter: '第一章',
      toc: [],
    },
    currentText: '',
    notes: [],
    highlights: [],
    readingSessions: [],
    webSearchConfig: {},
    signal: new AbortController().signal,
    runtimeFactory: runtimeFactoryFor(faux),
  });

  assert.equal(requestOptions.length, 1);
  assert.equal(requestOptions[0].reasoning, 'high');
});

test('OpenAI Compatible 运行时将推理强度编码为 reasoning_effort', async () => {
  const runtime = createOpenAICompatiblePiRuntime(
    {
      id: 'deepseek',
      name: 'DeepSeek',
      baseUrl: 'https://api.deepseek.com',
    },
    'deepseek-v4-flash',
    'high',
  );
  let requestPayload;
  const stream = runtime.models.streamSimple(
    runtime.model,
    {
      systemPrompt: '回答问题',
      messages: [{ role: 'user', content: '测试', timestamp: 1 }],
      tools: [],
    },
    {
      apiKey: 'test-key',
      reasoning: 'high',
      onPayload(payload) {
        requestPayload = payload;
      },
      async fetch() {
        return new Response(
          [
            'data: {"id":"test","choices":[{"index":0,"delta":{"role":"assistant","content":"完成"},"finish_reason":null}]}',
            '',
            'data: {"id":"test","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}',
            '',
            'data: [DONE]',
            '',
          ].join('\n'),
          { headers: { 'Content-Type': 'text/event-stream' }, status: 200 },
        );
      },
    },
  );

  const result = await stream.result();

  assert.equal(result.stopReason, 'stop');
  assert.equal(requestPayload.reasoning_effort, 'high');
});

test('PiAgent 执行阅读工具后继续生成最终回答', async () => {
  const faux = fauxProvider({ tokensPerSecond: 0 });
  faux.setResponses([
    fauxAssistantMessage(fauxToolCall('read_current_book', {}, { id: 'read-book' }), {
      stopReason: 'toolUse',
    }),
    fauxAssistantMessage('这是一本测试书。'),
  ]);
  const progress = [];

  const result = await runServerAiChat({
    config: { baseUrl: 'https://example.invalid/v1', apiKey: 'test-key' },
    model: 'mock',
    conversationId: 'conversation-b',
    messages: [{ role: 'user', content: '这是什么书？', createdAt: 1 }],
    resourceType: 'book',
    book: {
      id: 'book-a',
      title: '测试书',
      author: '作者',
      progress: 10,
      currentChapter: '第一章',
      toc: [],
    },
    currentText: '',
    notes: [],
    highlights: [],
    readingSessions: [],
    webSearchConfig: {},
    signal: new AbortController().signal,
    onProgress: (value) => progress.push(value),
    runtimeFactory: runtimeFactoryFor(faux),
  });

  assert.equal(faux.state.callCount, 2);
  assert.equal(result.content, '这是一本测试书。');
  const toolEntry = result.dialogueContent.find((item) => item.type === 'function_call');
  assert.equal(toolEntry?.name, 'read_current_book');
  assert.equal(toolEntry?.status, 'completed');
  assert.ok(
    progress.some((entry) => entry.dialogueContent.some((item) => item.type === 'function_call')),
  );
});

test('PiAgent 先读取版本再编辑当前书籍笔记', async () => {
  const faux = fauxProvider({ tokensPerSecond: 0 });
  faux.setResponses([
    fauxAssistantMessage(fauxToolCall('read_book_notes', {}, { id: 'read-notes' }), {
      stopReason: 'toolUse',
    }),
    fauxAssistantMessage(
      fauxToolCall(
        'update_book_note',
        {
          note_id: 'book-note:book-a',
          expected_updated_at: 10,
          content: '# AI 修订后的笔记',
        },
        { id: 'update-note' },
      ),
      { stopReason: 'toolUse' },
    ),
    fauxAssistantMessage('笔记已经按你的要求更新。'),
  ]);
  const calls = [];
  const changedNotes = [];
  const noteActions = {
    async readBookNotes(bookId) {
      calls.push(['read', bookId]);
      return [{ id: 'book-note:book-a', content: '# 原笔记', updatedAt: 10 }];
    },
    async createBookNote() {
      throw new Error('不应创建笔记');
    },
    async updateBookNote(bookId, noteId, expectedUpdatedAt, content) {
      calls.push(['update', bookId, noteId, expectedUpdatedAt, content]);
      return { id: noteId, content, updatedAt: 11 };
    },
  };

  const result = await runServerAiChat({
    config: { baseUrl: 'https://example.invalid/v1', apiKey: 'test-key' },
    model: 'mock',
    conversationId: 'conversation-note',
    messages: [{ role: 'user', content: '请把我的笔记改成修订稿', createdAt: 1 }],
    resourceType: 'book',
    book: {
      id: 'book-a',
      title: '测试书',
      author: '作者',
      progress: 10,
      currentChapter: '第一章',
      toc: [],
    },
    currentText: '',
    notes: [],
    highlights: [],
    readingSessions: [],
    webSearchConfig: {},
    signal: new AbortController().signal,
    noteActions,
    onNoteChange: (note) => changedNotes.push(note),
    runtimeFactory: runtimeFactoryFor(faux),
  });

  assert.deepEqual(calls, [
    ['read', 'book-a'],
    ['update', 'book-a', 'book-note:book-a', 10, '# AI 修订后的笔记'],
  ]);
  assert.deepEqual(changedNotes, [
    { id: 'book-note:book-a', content: '# AI 修订后的笔记', updatedAt: 11 },
  ]);
  assert.equal(result.content, '笔记已经按你的要求更新。');
});

test('PiAgent 在最后一轮关闭工具并按 SDK 生命周期停止', async () => {
  const faux = fauxProvider({ tokensPerSecond: 0 });
  const responses = Array.from({ length: 15 }, (_, index) =>
    fauxAssistantMessage(fauxToolCall('read_current_book', {}, { id: `read-book-${index}` }), {
      stopReason: 'toolUse',
    }),
  );
  responses.push((context) => {
    assert.deepEqual(context.tools, []);
    assert.match(context.systemPrompt, /这是最后一次模型请求/);
    return fauxAssistantMessage('已根据现有信息收束回答。');
  });
  faux.setResponses(responses);

  const result = await runServerAiChat({
    config: { baseUrl: 'https://example.invalid/v1', apiKey: 'test-key' },
    model: 'mock',
    conversationId: 'conversation-limit',
    messages: [{ role: 'user', content: '连续查阅后回答', createdAt: 1 }],
    resourceType: 'book',
    book: {
      id: 'book-a',
      title: '测试书',
      author: '作者',
      progress: 10,
      currentChapter: '第一章',
      toc: [],
    },
    currentText: '',
    notes: [],
    highlights: [],
    readingSessions: [],
    webSearchConfig: {},
    signal: new AbortController().signal,
    runtimeFactory: runtimeFactoryFor(faux),
  });

  assert.equal(faux.state.callCount, 16);
  assert.equal(result.content, '已根据现有信息收束回答。');
});
