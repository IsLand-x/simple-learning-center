import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

// Exercise the real state write queue, with only generation and job journaling replaced.
test('启动边界保持资源校验、持久化失败和执行上下文行为', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'learning-center-ai-start-'));
  process.env.LEARNING_CENTER_DATA_DIR = directory;
  process.env.LEARNING_CENTER_MODE = 'local';
  const { initializeDataDirectories } = await import('../../../infrastructure/fs/files.js');
  const { readPersistedState, writePersistedState } = await import('../../state/stateStore.js');
  const { createJobStarter } = await import('./start.js');
  await initializeDataDirectories();
  const jobs = new Map();
  const executed = [];
  const request = {
    configId: 'config',
    model: 'model',
    bookId: 'book',
    conversationId: 'conversation',
    userMessage: { id: 'question', content: '问题', quote: { text: ' 原文 ' } },
  };
  const start = createJobStarter({
    jobs,
    pruneJobs: () => {},
    executeJob: async (job, input) => executed.push({ job, input }),
    persistJob: async () => {},
  });
  try {
    await assert.rejects(start(request), { status: 409, message: '服务端尚未初始化' });
    assert.equal(jobs.size, 0);
    await writePersistedState({
      version: 41,
      state: {
        books: [{ id: 'book', kind: 'demo', title: '书籍', toc: [{ id: 'one', label: '第一章' }] }],
        openAIConfigs: [
          {
            id: 'config',
            models: ['model'],
            apiKey: 'test-only',
            baseUrl: 'https://example.invalid/v1',
          },
        ],
        highlights: [{ id: 'term', bookId: 'book', kind: 'term', text: '术语', createdAt: 1 }],
        chats: [],
        chatSessions: [],
      },
    });

    await context.test('模型、书籍、章节与配音校验仍先于注册与执行', async () => {
      for (const [changes, status, message] of [
        [{ configId: 'missing', bookId: 'missing' }, 404, '找不到所选模型配置'],
        [{ model: 'other', bookId: 'missing' }, 400, '所选模型不属于当前配置'],
        [{ bookId: 'missing', purpose: 'mindmap' }, 404, '找不到当前书籍'],
        [{ purpose: 'mindmap' }, 400, '章节不正确'],
        [
          { purpose: 'chapter-video', chapterId: 'missing', videoNarration: {} },
          404,
          '章节不存在或不属于当前书籍',
        ],
        [{ purpose: 'chapter-video', videoNarration: {} }, 400, '配音配置不正确'],
        [{ purpose: 'glossary', termId: 'missing' }, 404, '术语已删除或不属于当前书籍'],
      ]) {
        await assert.rejects(start({ ...request, ...changes }), { status, message });
      }
      assert.equal(jobs.size, 0);
      assert.deepEqual(executed, []);
      assert.deepEqual((await readPersistedState()).state.chats, []);
    });

    await context.test('任务日志持久化失败时撤销注册，保留已入队写入的提问', async () => {
      const failure = new Error('无法保存任务');
      let failedJob;
      const failedStart = createJobStarter({
        jobs,
        pruneJobs: () => {},
        executeJob: async () => assert.fail('持久化失败不能执行'),
        persistJob: async (job) => {
          failedJob = job;
          assert.equal(jobs.get(job.id), job);
          assert.deepEqual(
            (await readPersistedState()).state.chats.map((message) => message.id),
            ['question'],
          );
          throw failure;
        },
      });
      await assert.rejects(failedStart(request), (error) => error === failure);
      assert.equal(jobs.has(failedJob.id), false);
      assert.equal(failedJob.controller.signal.aborted, false);
      assert.equal(executed.length, 0);
      assert.equal((await readPersistedState()).state.chats[0].content, '问题');
    });

    await context.test('执行等待持久化完成，使用隔离的资源与对话快照', async () => {
      const entered = Promise.withResolvers();
      const saved = Promise.withResolvers();
      const received = [];
      const deferredStart = createJobStarter({
        jobs,
        pruneJobs: () => {},
        executeJob: async (job, input) => received.push({ job, input }),
        persistJob: async (job) => {
          entered.resolve(job);
          await saved.promise;
        },
      });
      const pending = deferredStart({
        ...request,
        userMessage: { id: 'next-question', content: '下个问题' },
      });
      try {
        const registered = await entered.promise;
        assert.equal(registered.status, 'queued');
        assert.equal(jobs.get(registered.id), registered);
        assert.equal(received.length, 0);
        assert.ok(registered.assistantCreatedAt > registered.userMessage.createdAt);
        saved.resolve();
        const accepted = await pending;
        assert.equal(received.length, 1);
        assert.equal(received[0].job.id, accepted.id);
        assert.deepEqual(
          received[0].input.messages.map((message) => message.content),
          ['问题', '下个问题'],
        );
        assert.deepEqual(received[0].input.messages[0].quote, { text: '原文', chapter: '' });
        received[0].input.book.title = '修改快照';
        received[0].input.config.models.push('other');
        received[0].input.messages.at(-1).content = '修改上下文';
        assert.equal(registered.userMessage.content, '下个问题');
        const state = (await readPersistedState()).state;
        assert.equal(state.books[0].title, '书籍');
        assert.deepEqual(state.openAIConfigs[0].models, ['model']);
      } finally {
        saved.resolve();
        await pending;
      }
    });

    await context.test('术语、导图和章节视频保留独立任务与两种配音配置', async () => {
      const { ttsSettings } = await import('../speech/settings.js');
      const chatsBefore = (await readPersistedState()).state.chats;
      const glossary = await start({ ...request, purpose: 'glossary', termId: 'term' });
      assert.equal(glossary.purpose, 'glossary');
      assert.equal(jobs.get(glossary.id).termUpdatedAt, 1);
      const mindmap = await start({ ...request, purpose: 'mindmap', chapterId: 'one' });
      assert.equal(mindmap.chapterId, 'one');
      const narrated = await start({
        ...request,
        purpose: 'chapter-video',
        chapterId: 'one',
        videoNarration: { configId: 'config', model: 'speech-model', voice: 'voice' },
      });
      assert.equal(jobs.get(narrated.id).chapterTitle, '第一章');
      assert.equal(executed.at(-1).input.videoNarration.model, 'speech-model');
      assert.equal(executed.at(-1).input.videoNarration.voice, 'voice');
      await ttsSettings.save({
        apiKey: 'tts-test-only',
        model: 'qwen3-tts-flash',
        voice: 'Cherry',
      });
      const wholeBook = await start({
        ...request,
        purpose: 'chapter-video',
        videoNarration: { source: 'settings' },
      });
      assert.equal(jobs.get(wholeBook.id).chapterTitle, '全书导读');
      assert.equal(executed.at(-1).input.videoNarration.tts.voice, 'Cherry');
      assert.equal(executed.at(-1).input.videoNarration.config.id, 'tts-settings');
      assert.equal(executed.at(-1).input.book.id, 'book');
      assert.deepEqual((await readPersistedState()).state.chats, chatsBefore);
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
