import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

test('视频任务进度落盘、同名章节隔离、重启中断和删除后不重建记录', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'learning-center-video-journal-'));
  process.env.LEARNING_CENTER_DATA_DIR = directory;
  const { createChapterVideoJobJournal } = await import('./jobJournal.js');
  const { mutatePersistedState } = await import('../../state/stateStore.js');
  const { chapterVideoDirectoryPath } = await import('../../../infrastructure/fs/files.js');
  await writeFile(
    join(directory, 'state.json'),
    JSON.stringify({
      version: 42,
      state: {
        books: [{ id: 'book', kind: 'demo', title: '测试书籍', toc: [] }],
      },
    }),
    { mode: 0o600 },
  );
  const makeJob = (id, chapterId) => ({
    id,
    bookId: 'book',
    chapterId,
    chapterTitle: '本章小结',
    model: 'test-model',
    status: 'running',
    revision: 1,
    content: '正在提炼知识点 1/3',
    createdAt: 1,
    updatedAt: 1,
  });
  const path = join(chapterVideoDirectoryPath('book'), 'jobs.json');
  try {
    const journal = createChapterVideoJobJournal();
    await Promise.all([
      journal.record({
        ...makeJob('one', 'chapter-one'),
        apiKey: 'must-not-be-saved',
        dialogueContent: [{ secret: 'hidden-context' }],
      }),
      journal.record(makeJob('two', 'chapter-two')),
    ]);
    await journal.record({
      ...makeJob('one', 'chapter-one'),
      revision: 3,
      content: '正在合成配音 2/3',
    });
    await journal.record({ ...makeJob('one', 'chapter-one'), revision: 2, content: '陈旧进度' });
    const jobs = await journal.list('book');
    assert.equal(jobs.length, 2);
    assert.equal(jobs.find((job) => job.id === 'one').content, '正在合成配音 2/3');
    assert.notEqual(jobs[0].chapterId, jobs[1].chapterId);
    assert.equal((await stat(path)).mode & 0o777, 0o600);
    const stored = await readFile(path, 'utf8');
    assert.equal(stored.includes('must-not-be-saved'), false);
    assert.equal(stored.includes('hidden-context'), false);
    const restarted = createChapterVideoJobJournal();
    const restored = await restarted.list('book');
    assert.ok(restored.every((job) => job.status === 'failed' && job.completedAt));
    assert.match(restored[0].error, /服务已重启.*中断/);
    assert.equal(restored.find((job) => job.id === 'one').content, '正在合成配音 2/3');
    assert.ok(
      JSON.parse(await readFile(path, 'utf8')).jobs.every((job) => job.status === 'failed'),
    );
    const { createApp } = await import('../../../app.js');
    const app = createApp({ serveFrontend: false });
    const response = await app.request('/api/ai/jobs/chapter-videos?bookId=book');
    assert.equal(response.status, 200);
    assert.equal((await response.json()).jobs.length, 2);
    assert.equal((await app.request('/api/ai/jobs/chapter-videos')).status, 400);
    assert.equal((await app.request('/api/ai/jobs/chapter-videos?bookId=other')).status, 404);
    const deletionPath = '/api/ai/jobs/chapter-videos/one';
    assert.equal((await app.request(deletionPath, { method: 'DELETE' })).status, 400);
    assert.equal(
      (await app.request(`${deletionPath}?bookId=other`, { method: 'DELETE' })).status,
      404,
    );
    assert.equal(
      (await app.request(`${deletionPath}?bookId=book`, { method: 'DELETE' })).status,
      204,
    );
    assert.equal(
      (await app.request(`${deletionPath}?bookId=book`, { method: 'DELETE' })).status,
      404,
    );
    assert.deepEqual(
      (await (await app.request('/api/ai/jobs/chapter-videos?bookId=book')).json()).jobs.map(
        (job) => job.id,
      ),
      ['two'],
    );
    assert.deepEqual(
      (await createChapterVideoJobJournal().list('book')).map((job) => job.id),
      ['two'],
    );
    // Active tasks are protected; late callbacks after cancellation cannot resurrect a removed row.
    const deletionJournal = createChapterVideoJobJournal();
    const mediaPath = join(chapterVideoDirectoryPath('book'), 'existing.mp4');
    await writeFile(mediaPath, 'existing successful video', { mode: 0o600 });
    await deletionJournal.record(makeJob('active', 'chapter-two'));
    await assert.rejects(deletionJournal.remove('book', 'active'), { status: 409 });
    await deletionJournal.record({
      ...makeJob('active', 'chapter-two'),
      revision: 2,
      status: 'cancelled',
    });
    await deletionJournal.remove('book', 'active');
    await deletionJournal.record({
      ...makeJob('active', 'chapter-two'),
      revision: 3,
      status: 'cancelled',
    });
    assert.equal(
      (await deletionJournal.list('book')).some((job) => job.id === 'active'),
      false,
    );
    assert.equal(
      JSON.parse(await readFile(path, 'utf8')).jobs.some((job) => job.id === 'active'),
      false,
    );
    assert.equal(await readFile(mediaPath, 'utf8'), 'existing successful video');
    await mutatePersistedState((persisted) => {
      persisted.state.books = [];
    });
    await rm(chapterVideoDirectoryPath('book'), { recursive: true, force: true });
    await restarted.record({ ...makeJob('one', 'chapter-one'), revision: 10, status: 'cancelled' });
    await assert.rejects(stat(path), { code: 'ENOENT' });
    await assert.rejects(restarted.list('book'), /书籍不存在/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
