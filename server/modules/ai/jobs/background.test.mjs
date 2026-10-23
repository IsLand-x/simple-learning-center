import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
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
    // The response is an acknowledgement of durable storage, before generation finishes.
    const { persistedState: accepted } = JSON.parse(
      await readFile(join(directory, 'state.json'), 'utf8'),
    );
    assert.deepEqual(
      accepted.state.chats.map((message) => message.id),
      ['question'],
    );
    assert.equal(accepted.state.chatSessions[0].id, 'session');
    const messages = await (
      await app.request('/api/conversations/session/messages?bookId=book')
    ).json();
    assert.equal(messages.messages[0].content, '提问');
    const summary = await (await app.request('/api/ai/jobs?bookId=book&view=summary')).json();
    assert.equal(summary.jobs[0].id, job.id);
    assert.equal(Object.hasOwn(summary.jobs[0], 'content'), false);
    assert.equal(Object.hasOwn(summary.jobs[0], 'dialogueContent'), false);
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
