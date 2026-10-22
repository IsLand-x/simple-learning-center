import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

test('章节导图后台生成、分区保护、失败保留、取消与书籍删除清理', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'learning-center-mindmaps-'));
  process.env.LEARNING_CENTER_DATA_DIR = directory;
  process.env.LEARNING_CENTER_MODE = 'local';
  const { initializeDataDirectories } = await import('../../../infrastructure/fs/files.js');
  const { createApp } = await import('../../../app.js');
  const { mutatePersistedState, readPersistedState } = await import('../../state/stateStore.js');
  await initializeDataDirectories();
  let finish;
  let gate;
  let invalid = false;
  const received = [];
  const reset = () => {
    gate = new Promise((resolve) => {
      finish = resolve;
    });
  };
  reset();
  const quote = '可靠性需要系统在出现故障时仍然继续正确运行。';
  const app = createApp({
    serveFrontend: false,
    aiJobRunner: async (context) => {
      received.push(context);
      await gate;
      context.onProgress({ content: '', dialogueContent: [] });
      return {
        content: JSON.stringify({
          nodes: [
            {
              key: 'reliability',
              parent: null,
              title: '可靠性要求容忍故障',
              sources: [
                {
                  passageId:
                    /"passageId":"([^"]+)"/.exec(context.messages[0].content)?.[1] ?? '1:0',
                  quote: invalid ? '这是一条完全没有出现在书中的原文。' : quote,
                },
              ],
            },
          ],
        }),
        dialogueContent: [],
      };
    },
  });
  const request = (path, method, body) =>
    app.request(path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  const input = (chapterId = 'one') => ({
    configId: 'model',
    model: 'test',
    bookId: 'book',
    purpose: 'mindmap',
    chapterId,
    conversationId: `mindmap-${Date.now()}`,
    userMessage: { id: `user-${Date.now()}`, content: '生成章节思维导图', createdAt: Date.now() },
    session: { title: '章节导图', createdAt: 1 },
    currentText: '不应发送给模型的其他章节文字',
  });
  const wait = async (id, status = 'completed') => {
    for (let attempt = 0; attempt < 200; attempt++) {
      const job = await (await app.request(`/api/ai/jobs/${id}`)).json();
      if (job.status === status) return job;
      if (['failed', 'cancelled', 'completed'].includes(job.status))
        assert.fail(JSON.stringify(job));
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.fail('导图任务未结束');
  };
  const maps = async (chapterId = 'one') =>
    ((await readPersistedState()).state.chapterMindMaps ?? []).filter(
      (map) => map.chapterId === chapterId,
    );
  try {
    assert.equal(
      (
        await request('/api/state', 'PUT', {
          version: 39,
          state: {
            books: [
              {
                id: 'book',
                kind: 'epub',
                title: '测试书',
                fileSize: 42,
                toc: [
                  {
                    id: 'one',
                    href: 'one.xhtml',
                    label: '同名章节',
                    subitems: [{ id: 'child', href: 'one.xhtml#child', label: '小节' }],
                  },
                  { id: 'two', href: 'two.xhtml', label: '同名章节' },
                ],
              },
            ],
            openAIConfigs: [{ id: 'model', models: ['test'], apiKey: 'test-secret' }],
            chats: [],
            chatSessions: [],
          },
        })
      ).status,
      204,
    );
    assert.equal(
      (
        await request('/api/search-indexes/book', 'PUT', {
          version: 3,
          bookId: 'book',
          fileSize: 42,
          passages: [
            {
              id: '1:0',
              chapterIds: ['one', 'child'],
              href: 'one.xhtml',
              chapter: '第一章',
              sectionIndex: 1,
              cfi: 'trusted-cfi',
              text: quote,
            },
            {
              id: '2:0',
              chapterIds: ['two'],
              href: 'two.xhtml',
              chapter: '第二章',
              sectionIndex: 2,
              cfi: 'other-cfi',
              text: '这是第二章的原文，不能外发到第一章任务中。',
            },
          ],
        })
      ).status,
      204,
    );
    assert.equal((await request('/api/ai/jobs', 'POST', input('missing'))).status, 404);
    const simultaneous = await Promise.all([
      request('/api/ai/jobs', 'POST', input()),
      request('/api/ai/jobs', 'POST', input()),
    ]);
    assert.deepEqual(simultaneous.map((response) => response.status).sort(), [202, 409]);
    const job = await simultaneous.find((response) => response.status === 202).json();
    assert.equal(job.chapterId, 'one');
    finish();
    await wait(job.id);
    assert.equal(received[0].purpose, 'mindmap');
    assert.equal(received[0].messages[0].content.includes('这是第二章的原文'), false);
    assert.equal(received[0].currentText, '');
    assert.deepEqual(received[0].notes, []);
    assert.equal((await maps())[0].nodes[1].sources[0].cfi, 'trusted-cfi');
    assert.equal((await maps())[0].revision, 1);
    assert.deepEqual((await readPersistedState()).state.chats, []);
    assert.deepEqual((await readPersistedState()).state.chatSessions, []);
    const childJob = await (await request('/api/ai/jobs', 'POST', input('child'))).json();
    await wait(childJob.id);
    assert.equal((await maps('child')).length, 1);
    assert.notEqual((await maps())[0].id, (await maps('child'))[0].id);
    const stale = await (await app.request('/api/state/reading')).json();
    stale.state.chapterMindMaps = [];
    assert.equal((await request('/api/state/reading', 'PUT', stale)).status, 204);
    assert.equal((await maps()).length, 1);

    invalid = true;
    const failed = await (await request('/api/ai/jobs', 'POST', input())).json();
    await wait(failed.id, 'failed');
    assert.equal((await maps())[0].revision, 1);
    invalid = false;
    reset();
    const cancelled = await (await request('/api/ai/jobs', 'POST', input())).json();
    assert.equal((await request(`/api/ai/jobs/${cancelled.id}`, 'DELETE')).status, 200);
    finish();
    await wait(cancelled.id, 'cancelled');
    assert.equal((await maps())[0].revision, 1);

    const beforeBatches = received.length;
    await request('/api/search-indexes/book', 'PUT', {
      version: 3,
      bookId: 'book',
      fileSize: 42,
      passages: Array.from({ length: 26 }, (_, index) => ({
        id: `1:${index}`,
        chapterIds: ['one'],
        href: 'one.xhtml',
        chapter: '第一章',
        sectionIndex: 1,
        cfi: `trusted-cfi-${index}`,
        text: quote + '补充论据说明。'.repeat(150),
      })),
    });
    const batched = await (await request('/api/ai/jobs', 'POST', input())).json();
    await wait(batched.id);
    assert.ok(received.length - beforeBatches >= 4, '长章节应逐批分析后合并');
    assert.ok(
      received.slice(beforeBatches).some((context) => context.messages[0].content.includes('1:25')),
      '最后的正文段落也必须送入分析',
    );
    assert.equal((await maps())[0].revision, 2);

    const beforeOversize = received.length;
    await request('/api/search-indexes/book', 'PUT', {
      version: 3,
      bookId: 'book',
      fileSize: 42,
      passages: Array.from({ length: 340 }, (_, index) => ({
        id: `1:${index}`,
        chapterIds: ['one'],
        href: 'one.xhtml',
        chapter: '第一章',
        sectionIndex: 1,
        cfi: `trusted-cfi-${index}`,
        text: quote + '补充论据。'.repeat(230),
      })),
    });
    const oversize = await (await request('/api/ai/jobs', 'POST', input())).json();
    await wait(oversize.id, 'failed');
    assert.equal(received.length, beforeOversize);
    assert.equal((await maps())[0].revision, 2);
    await request('/api/search-indexes/book', 'PUT', {
      version: 3,
      bookId: 'book',
      fileSize: 42,
      passages: [
        {
          id: '1:0',
          chapterIds: ['one'],
          href: 'one.xhtml',
          chapter: '第一章',
          sectionIndex: 1,
          cfi: 'trusted-cfi',
          text: quote,
        },
      ],
    });
    reset();
    const deleting = await (await request('/api/ai/jobs', 'POST', input())).json();
    // Use the same serialized mutation primitive as permanent book deletion.
    const { permanentlyDeleteBookInState } = await import('../../state/compatibility/bookTrash.js');
    await mutatePersistedState((state) => permanentlyDeleteBookInState(state, 'book'));
    finish();
    await wait(deleting.id);
    assert.deepEqual(await maps(), []);
    assert.equal((await request('/api/state/reading', 'PUT', stale)).status, 204);
    assert.deepEqual(await maps(), []);
  } finally {
    finish();
    await rm(directory, { recursive: true, force: true });
  }
});
