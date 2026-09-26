import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const directory = await mkdtemp(join(tmpdir(), 'state-store-test-'));
process.env.LEARNING_CENTER_DATA_DIR = directory;
const { mutatePersistedState, readPersistedState, writePersistedState } =
  await import('./stateStore.js');
const { atomicWrite, knowledgeMapDirectoryPath } = await import('../../infrastructure/fs/files.js');
const { saveBookResource } = await import('../books/resources.js');
const { movePersistedBookToTrash } = await import('../books/trash.js');
const imageId = '11111111-1111-4111-8111-111111111111';

beforeEach(async () => {
  await rm(directory, { recursive: true, force: true });
  await writePersistedState({
    version: 25,
    state: { books: [{ id: 'book', title: '原书名', fileSize: 42 }], notes: [] },
  });
});
after(() => rm(directory, { recursive: true, force: true }));

test('状态更新、图片收藏和书籍回收共用串行提交边界', async () => {
  const imageDirectory = knowledgeMapDirectoryPath('book');
  await atomicWrite(join(imageDirectory, `${imageId}.png`), Buffer.from('fixture'));
  const entered = Promise.withResolvers();
  const release = Promise.withResolvers();
  const update = mutatePersistedState(async (snapshot) => {
    snapshot.state.books[0].title = '更新后的书名';
    entered.resolve();
    await release.promise;
  });
  await entered.promise;
  const collection = saveBookResource('book', { imageId, title: '知识地图' });
  const trash = movePersistedBookToTrash('book', { now: () => 100 });

  try {
    const diskState = JSON.parse(await readFile(join(directory, 'state.json'), 'utf8'));
    assert.equal(diskState.persistedState.state.books[0].title, '原书名');
    await assert.rejects(readFile(join(imageDirectory, 'resources.json')), { code: 'ENOENT' });
  } finally {
    release.resolve();
  }

  const [, resources, trashed] = await Promise.all([update, collection, trash]);
  assert.equal(resources[0].imageId, imageId);
  assert.equal(trashed.book.title, '更新后的书名');
  const stored = await readPersistedState();
  assert.deepEqual(stored.state.books, []);
  assert.equal(stored.state.trashedBooks[0].book.title, '更新后的书名');
  await assert.rejects(saveBookResource('book', { imageId, title: '不应再次收藏' }), {
    status: 404,
  });
  const manifest = JSON.parse(await readFile(join(imageDirectory, 'resources.json'), 'utf8'));
  assert.equal(manifest.resources[0].title, '知识地图');
});

test('失败操作不提交半成品，后续排队写入继续读取最后成功的状态', async () => {
  const entered = Promise.withResolvers();
  const release = Promise.withResolvers();
  const failed = mutatePersistedState(async (snapshot) => {
    snapshot.state.books[0].title = '不应提交的书名';
    entered.resolve();
    await release.promise;
    throw new Error('模拟操作失败');
  });
  const rejected = assert.rejects(failed, /模拟操作失败/);
  await entered.promise;
  const next = mutatePersistedState((snapshot) => {
    assert.equal(snapshot.state.books[0].title, '原书名');
    snapshot.state.books[0].title = '后续操作已保存';
  });
  release.resolve();
  await Promise.all([rejected, next]);
  const stored = await readPersistedState();
  assert.equal(stored.state.books[0].title, '后续操作已保存');
});
