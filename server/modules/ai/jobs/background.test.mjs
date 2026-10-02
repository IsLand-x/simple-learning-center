import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

test('关闭任务事件流不取消生成，完成与已读状态保存在服务端', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'learning-center-ai-background-'));
  process.env.LEARNING_CENTER_DATA_DIR = directory;
  process.env.LEARNING_CENTER_MODE = 'local';
  const { initializeDataDirectories } = await import('../../../infrastructure/fs/files.js');
  const { createApp } = await import('../../../app.js');
  await initializeDataDirectories();
  let finish;
  let taskSignal;
  const gate = new Promise((resolve) => {
    finish = resolve;
  });
  const app = createApp({
    serveFrontend: false,
    aiJobRunner: async ({ signal }) => {
      taskSignal = signal;
      await gate;
      return { content: '后台回复', dialogueContent: [], status: 'completed' };
    },
  });
  const put = (path, body) =>
    app.request(path, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  try {
    const initialized = await put('/api/state?initialize=1', {
      version: 33,
      state: {
        books: [{ id: 'book', kind: 'demo', title: '测试书籍', toc: [] }],
        openAIConfigs: [
          {
            id: 'model',
            name: '测试模型',
            baseUrl: 'https://example.invalid/v1',
            apiKey: 'test-only',
            models: ['test-model'],
          },
        ],
        chats: [],
        chatSessions: [],
      },
    });
    assert.equal(initialized.status, 204);
    const started = await app.request('/api/ai/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        configId: 'model',
        model: 'test-model',
        bookId: 'book',
        conversationId: 'session',
        userMessage: { id: 'question', content: '提问', createdAt: 1 },
        session: { title: '后台对话', createdAt: 1 },
        currentText: '',
      }),
    });
    assert.equal(started.status, 202);
    const job = await started.json();
    const events = await app.request(`/api/ai/jobs/${job.id}/events`);
    const reader = events.body.getReader();
    await reader.read();
    await reader.cancel();
    assert.equal(taskSignal.aborted, false);
    finish();
    let result;
    for (let attempt = 0; attempt < 100; attempt++) {
      result = await (await app.request(`/api/ai/jobs/${job.id}`)).json();
      if (result.status === 'completed') break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(result.status, 'completed');
    const snapshot = await (await app.request('/api/state/conversations')).json();
    const reply = snapshot.state.chats.find((message) => message.role === 'assistant');
    assert.equal(reply.content, '后台回复');
    assert.equal(reply.readAt, undefined);
    const stale = structuredClone(snapshot);
    reply.readAt = 123;
    assert.equal((await put('/api/state/conversations', snapshot)).status, 204);
    assert.equal((await put('/api/state/conversations', stale)).status, 204);
    const saved = await (await app.request('/api/state/conversations')).json();
    assert.equal(saved.state.chats.find((message) => message.id === reply.id).readAt, 123);
  } finally {
    finish();
    await rm(directory, { recursive: true, force: true });
  }
});
