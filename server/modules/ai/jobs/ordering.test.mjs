import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

test('设备时钟超前、落后或同毫秒发送时，服务端始终保存提问在回复之前', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'learning-center-ai-ordering-'));
  process.env.LEARNING_CENTER_DATA_DIR = directory;
  process.env.LEARNING_CENTER_MODE = 'local';
  const { initializeDataDirectories } = await import('../../../infrastructure/fs/files.js');
  const { createApp } = await import('../../../app.js');
  await initializeDataDirectories();
  context.mock.method(Date, 'now', () => 1000);
  const app = createApp({
    serveFrontend: false,
    aiJobRunner: async () => ({ content: '回复', dialogueContent: [], status: 'completed' }),
  });
  try {
    const initialized = await app.request('/api/state?initialize=1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        version: 41,
        state: {
          books: [{ id: 'book', kind: 'demo', title: '测试书籍', toc: [] }],
          openAIConfigs: [
            { id: 'config', baseUrl: 'https://example.invalid/v1', models: ['model'] },
          ],
          chatSessions: [
            { id: 'session', bookId: 'book', title: '历史对话', createdAt: 1, updatedAt: 2000 },
          ],
          chats: [
            {
              id: 'history',
              bookId: 'book',
              conversationId: 'session',
              role: 'assistant',
              content: '历史回复',
              createdAt: 2000,
            },
          ],
        },
      }),
    });
    assert.equal(initialized.status, 204);
    const ids = ['history'];
    for (const [index, clientTime] of [1_000_000, 1, 1000].entries()) {
      const response = await app.request('/api/ai/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          configId: 'config',
          model: 'model',
          bookId: 'book',
          conversationId: 'session',
          userMessage: { id: `user-${index}`, content: `问题 ${index}`, createdAt: clientTime },
          session: { title: '历史对话', createdAt: 1 },
          currentText: '',
        }),
      });
      assert.equal(response.status, 202);
      const job = await response.json();
      assert.equal(job.userMessage.id, `user-${index}`);
      assert.notEqual(job.userMessage.createdAt, clientTime);
      assert.ok(job.assistantCreatedAt > job.userMessage.createdAt);
      let completed;
      for (let attempt = 0; attempt < 100; attempt++) {
        completed = await (await app.request(`/api/ai/jobs/${job.id}`)).json();
        if (completed.status === 'completed') break;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      assert.equal(completed.status, 'completed');
      ids.push(job.userMessageId, job.assistantMessageId);
      const page = await (
        await app.request('/api/conversations/session/messages?bookId=book')
      ).json();
      assert.deepEqual(
        page.messages.map((message) => message.id),
        ids,
      );
      assert.equal(page.session.createdAt, 1);
      assert.equal(page.messages.at(-2).createdAt, job.userMessage.createdAt);
      assert.equal(page.messages.at(-1).createdAt, job.assistantCreatedAt);
    }
    const summary = await (await app.request('/api/ai/jobs?bookId=book&view=summary')).json();
    assert.equal(Object.hasOwn(summary.jobs[0], 'userMessage'), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
