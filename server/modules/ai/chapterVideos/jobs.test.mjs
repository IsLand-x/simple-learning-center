import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { videoFixtureResponse } from '../../../tests/fixtures/chapterVideoModel.mjs';

const hasFfmpeg = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0;

test(
  '章节视频后台生成、全书/大章隔离、Range播放、失败保留、取消、删除及陈旧客户端保护',
  { skip: !hasFfmpeg, timeout: 900_000 },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), 'learning-center-chapter-video-'));
    process.env.LEARNING_CENTER_DATA_DIR = directory;
    process.env.LEARNING_CENTER_MODE = 'local';
    const { createApp } = await import('../../../app.js');
    const { initializeDataDirectories, chapterVideoPath, chapterVideoDirectoryPath } =
      await import('../../../infrastructure/fs/files.js');
    const { readPersistedState } = await import('../../state/stateStore.js');
    await initializeDataDirectories();
    const quote = '可靠性是系统在遇到故障时仍然继续正确运行的能力。';
    const other = '第二章讨论的是扩展能力，这些知识不应出现在第一章的输入中。';
    const received = [];
    let invalid = false;
    let block;
    let release;
    const pause = () => {
      block = new Promise((resolve) => {
        release = resolve;
      });
    };
    const app = createApp({
      serveFrontend: false,
      aiJobRunner: async (context) => {
        received.push(context);
        if (block) await block;
        return {
          content: videoFixtureResponse(
            context.videoPhase ?? (context.purpose === 'mindmap' ? 'mindmap' : 'overview'),
            context.messages[0].content,
            invalid,
          ),
          dialogueContent: [],
        };
      },
    });
    const request = (path, method, body, headers = {}) =>
      app.request(path, {
        method,
        headers: { 'Content-Type': 'application/json', ...headers },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    const input = (chapterId) => ({
      configId: 'model',
      model: 'test',
      bookId: 'book',
      purpose: 'chapter-video',
      ...(chapterId ? { chapterId } : {}),
      conversationId: `chapter-video-${Math.random()}`,
      userMessage: { id: `user-${Math.random()}`, content: '生成讲解视频', createdAt: 1 },
      session: { title: '章节视频', createdAt: 1 },
      currentText: '不应该外发的页面正文',
    });
    const wait = async (id, status = 'completed') => {
      const until = Date.now() + 360_000;
      while (Date.now() < until) {
        const job = await (await app.request(`/api/ai/jobs/${id}`)).json();
        if (job.status === status) return job;
        if (['failed', 'cancelled', 'completed'].includes(job.status))
          assert.fail(JSON.stringify(job));
        await new Promise((resolve) => setTimeout(resolve, 40));
      }
      assert.fail('视频生成超时');
    };
    const videos = async () => (await readPersistedState()).state.chapterVideos ?? [];
    try {
      await request('/api/state', 'PUT', {
        version: 42,
        state: {
          books: [
            {
              id: 'book',
              kind: 'epub',
              title: '测试书籍',
              fileSize: 42,
              toc: [
                {
                  id: 'one',
                  label: '第一大章',
                  href: 'one.xhtml',
                  subitems: [{ id: 'child', label: '小节', href: 'one.xhtml#child' }],
                },
                { id: 'two', label: '第二章', href: 'two.xhtml' },
              ],
            },
          ],
          openAIConfigs: [{ id: 'model', models: ['test'], apiKey: 'fixture-secret' }],
          chats: [],
          chatSessions: [],
        },
      });
      await request('/api/search-indexes/book', 'PUT', {
        version: 3,
        bookId: 'book',
        fileSize: 42,
        passages: [
          {
            id: '1:0',
            chapterIds: ['one', 'child'],
            href: 'one.xhtml',
            chapter: '第一大章',
            sectionIndex: 0,
            cfi: 'trusted-cfi',
            text: quote,
          },
          {
            id: '2:0',
            chapterIds: ['two'],
            href: 'two.xhtml',
            chapter: '第二章',
            sectionIndex: 1,
            cfi: 'second-cfi',
            text: other,
          },
        ],
      });
      assert.equal((await request('/api/ai/jobs', 'POST', input('missing'))).status, 404);
      assert.equal(
        (
          await request('/api/ai/jobs', 'POST', {
            ...input(),
            videoNarration: { configId: 'unselected', model: 'tts', voice: 'alloy' },
          })
        ).status,
        400,
      );
      const job = await (await request('/api/ai/jobs', 'POST', input())).json();
      await wait(job.id);
      const whole = (await videos())[0];
      assert.equal(whole.chapterId, undefined);
      assert.equal(whole.hasAudio, false);
      assert.ok(whole.durationSeconds >= 24);
      assert.ok(received[0].messages[0].content.includes(other), '全书导读必须处理所有章节正文');
      assert.equal(received[0].currentText, '');
      assert.deepEqual(received[0].notes, []);
      assert.equal((await stat(chapterVideoPath('book', whole.id, 'mp4'))).mode & 0o777, 0o600);
      const mediaUrl = `/api/books/book/chapter-videos/${whole.id}`;
      const ranged = await app.request(mediaUrl, { headers: { Range: 'bytes=0-31' } });
      assert.equal(ranged.status, 206);
      assert.match(ranged.headers.get('Content-Range'), /^bytes 0-31\//);
      assert.equal(ranged.headers.get('Content-Type'), 'video/mp4');
      assert.equal((await ranged.arrayBuffer()).byteLength, 32);
      assert.equal(
        (await app.request(mediaUrl, { headers: { Range: 'bytes=999999999999-' } })).status,
        416,
      );
      assert.equal((await app.request(mediaUrl, { method: 'HEAD' })).status, 200);
      assert.equal((await app.request(`${mediaUrl}/poster`)).status, 200);
      assert.equal((await app.request(`/api/books/other/chapter-videos/${whole.id}`)).status, 404);
      assert.deepEqual((await readPersistedState()).state.chats, []);
      assert.deepEqual((await readPersistedState()).state.chatSessions, []);
      const before = received.length;
      const chapterJob = await (await request('/api/ai/jobs', 'POST', input('one'))).json();
      await wait(chapterJob.id);
      assert.equal((await videos()).length, 2);
      const completedChapter = (await videos()).find((video) => video.chapterId === 'one');
      assert.ok(completedChapter.coverage.length > 0);
      assert.ok(completedChapter.coverage.every((topic) => topic.sceneIndexes.length > 0));
      assert.equal(received[before].messages[0].content.includes(other), false);
      assert.ok(received[before].messages[0].content.includes(quote), '大章包含下属小节的原文');
      const stale = await (await app.request('/api/state/reading')).json();
      stale.state.chapterVideos = [];
      await request('/api/state/reading', 'PUT', stale);
      assert.equal((await videos()).length, 2);
      invalid = true;
      const failed = await (await request('/api/ai/jobs', 'POST', input())).json();
      await wait(failed.id, 'failed');
      assert.ok((await videos()).some((video) => video.id === whole.id));
      invalid = false;
      pause();
      const concurrent = await Promise.all([
        request('/api/ai/jobs', 'POST', input()),
        request('/api/ai/jobs', 'POST', input()),
      ]);
      assert.deepEqual(concurrent.map((response) => response.status).sort(), [202, 409]);
      const cancelled = await concurrent.find((response) => response.status === 202).json();
      await request(`/api/ai/jobs/${cancelled.id}`, 'DELETE');
      release();
      block = undefined;
      await wait(cancelled.id, 'cancelled');
      assert.equal((await videos()).length, 2);
      assert.equal((await request(mediaUrl, 'DELETE')).status, 204);
      assert.equal((await app.request(mediaUrl)).status, 404);
      await assert.rejects(stat(chapterVideoPath('book', whole.id, 'mp4')), { code: 'ENOENT' });
      pause();
      const deleting = await (await request('/api/ai/jobs', 'POST', input())).json();
      await request('/api/books/book', 'DELETE');
      release();
      block = undefined;
      await wait(deleting.id, 'failed');
      assert.deepEqual(await videos(), []);
      await assert.rejects(readdir(chapterVideoDirectoryPath('book')), { code: 'ENOENT' });
    } finally {
      release?.();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
