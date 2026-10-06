import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

test('术语释义后台落盘，校验归属、防重复请求，保留手改与删除决定', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'learning-center-glossary-'));
  process.env.LEARNING_CENTER_DATA_DIR = directory;
  process.env.LEARNING_CENTER_MODE = 'local';
  const { initializeDataDirectories } = await import('../../../infrastructure/fs/files.js');
  const { createApp } = await import('../../../app.js');
  await initializeDataDirectories();
  let finish;
  let gate;
  const reset = () => {
    gate = new Promise((resolve) => {
      finish = resolve;
    });
  };
  reset();
  const app = createApp({
    serveFrontend: false,
    aiJobRunner: async () => {
      await gate;
      return { content: '结合本书语境的释义', dialogueContent: [] };
    },
  });
  const request = (path, method, body) =>
    app.request(path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  const read = async () => await (await app.request('/api/state/highlights')).json();
  const input = (termId = 'term') => ({
    configId: 'model',
    model: 'test',
    bookId: 'book',
    purpose: 'glossary',
    termId,
    conversationId: `glossary:${termId}`,
    userMessage: { id: `user-${Date.now()}`, content: '解释术语', createdAt: Date.now() },
    session: { title: '术语', createdAt: 1 },
    currentText: '',
  });
  const wait = async (id) => {
    for (let i = 0; i < 100; i++) {
      const job = await (await app.request(`/api/ai/jobs/${id}`)).json();
      if (job.status === 'completed') return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.fail('后台任务未完成');
  };
  try {
    assert.equal(
      (
        await request('/api/state', 'PUT', {
          version: 38,
          state: {
            books: [{ id: 'book', kind: 'demo', title: '本书', toc: [] }],
            openAIConfigs: [{ id: 'model', models: ['test'] }],
            highlights: [
              {
                id: 'term',
                bookId: 'book',
                kind: 'term',
                text: '术语',
                cfi: 'original',
                chapter: '一',
                createdAt: 1,
                updatedAt: 1,
              },
              {
                id: 'foreign',
                bookId: 'other',
                kind: 'term',
                text: '其他书',
                cfi: 'other',
                chapter: '一',
                createdAt: 1,
              },
            ],
            chats: [],
            chatSessions: [],
          },
        })
      ).status,
      204,
    );
    assert.equal((await request('/api/ai/jobs', 'POST', input('missing'))).status, 404);
    assert.equal((await request('/api/ai/jobs', 'POST', input('foreign'))).status, 404);
    const job = await (await request('/api/ai/jobs', 'POST', input())).json();
    assert.equal(job.termId, 'term');
    assert.equal((await request('/api/ai/jobs', 'POST', input())).status, 409);
    finish();
    await wait(job.id);
    let snapshot = await read();
    assert.equal(snapshot.state.highlights[0].definition, '结合本书语境的释义');
    const stale = structuredClone(snapshot);
    reset();
    const next = await (await request('/api/ai/jobs', 'POST', input())).json();
    snapshot.state.highlights[0].definition = '用户手动修改';
    snapshot.state.highlights[0].updatedAt += 1;
    assert.equal((await request('/api/state/highlights', 'PUT', snapshot)).status, 204);
    finish();
    await wait(next.id);
    assert.equal((await read()).state.highlights[0].definition, '用户手动修改');
    reset();
    const last = await (await request('/api/ai/jobs', 'POST', input())).json();
    snapshot = await read();
    const term = snapshot.state.highlights[0];
    snapshot.state.highlights = snapshot.state.highlights.filter((item) => item.id !== 'term');
    snapshot.state.deletedHighlightTombstones = [
      { highlightId: 'term', bookId: 'book', deletedAt: term.updatedAt + 1 },
    ];
    assert.equal((await request('/api/state/highlights', 'PUT', snapshot)).status, 204);
    finish();
    await wait(last.id);
    await request('/api/state/highlights', 'PUT', stale);
    assert.equal(
      (await read()).state.highlights.some((item) => item.id === 'term'),
      false,
    );
  } finally {
    finish();
    await rm(directory, { recursive: true, force: true });
  }
});
