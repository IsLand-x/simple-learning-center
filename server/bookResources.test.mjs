import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { mkdtemp, readFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const directory = await mkdtemp(join(tmpdir(), 'book-resources-test-'));
process.env.LEARNING_CENTER_DATA_DIR = directory;
const { createApp } = await import('./app.mjs');
const { atomicWrite, knowledgeMapDirectoryPath } = await import('./storage.mjs');
const { saveBookResource, renameBookResource } = await import('./knowledgeMaps/resources.mjs');
const app = createApp({ mode: 'local', serveFrontend: false });
const id = '11111111-1111-4111-8111-111111111111';
const secondId = '22222222-2222-4222-8222-222222222222';
const base = '/api/books/book/resources';
const manifest = join(knowledgeMapDirectoryPath('book'), 'resources.json');
const image = join(knowledgeMapDirectoryPath('book'), `${id}.png`);
const save = (payload = { imageId: id, title: '因果机制' }, path = base) =>
  app.request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
after(() => rm(directory, { recursive: true, force: true }));
beforeEach(async () => {
  await rm(knowledgeMapDirectoryPath('book'), { recursive: true, force: true });
  await atomicWrite(
    join(directory, 'state.json'),
    JSON.stringify({
      version: 33,
      state: {
        books: [
          { id: 'book', title: '示例', fileSize: 42 },
          { id: 'other', title: '另一本书', fileSize: 42 },
        ],
      },
    }),
  );
  await atomicWrite(image, Buffer.from('local-image-fixture'));
});

test('资源库空列表、并发去重和权限，重新读取保留收藏', async () => {
  assert.deepEqual(await (await app.request(base)).json(), { resources: [] });
  await atomicWrite(
    join(knowledgeMapDirectoryPath('book'), `${secondId}.png`),
    Buffer.from('second-image'),
  );
  const responses = await Promise.all([
    save(),
    save(),
    save({ imageId: secondId, title: '对比图' }),
  ]);
  responses.forEach((response) => assert.equal(response.status, 200));
  const { resources } = await (await app.request(base)).json();
  assert.equal(resources.length, 2);
  assert.equal(resources[1].title, '因果机制');
  assert.equal(resources[1].url, `/api/books/book/knowledge-maps/${id}`);
  assert.equal((await stat(manifest)).mode & 0o777, 0o600);
  assert.equal((await stat(knowledgeMapDirectoryPath('book'))).mode & 0o777, 0o700);
  assert.equal(JSON.parse(await readFile(manifest, 'utf8')).resources.length, 2);
  assert.deepEqual(await (await app.request('/api/books/other/resources')).json(), {
    resources: [],
  });
});

test('只允许本书已有图片，拒绝非法标识、任意 URL、过长标题和无效请求', async () => {
  for (const payload of [
    null,
    {},
    { imageId: '../../state', title: '图' },
    { imageId: id, title: '' },
    { imageId: id, title: '字'.repeat(201) },
    { imageId: id, title: '图', url: 'https://example.com/image' },
  ]) {
    assert.equal((await save(payload)).status, 400);
  }
  assert.equal((await save({ imageId: secondId, title: '不存在' })).status, 404);
  assert.equal((await save(undefined, '/api/books/other/resources')).status, 404);
  assert.equal((await save(undefined, '/api/books/missing/resources')).status, 404);
  assert.equal((await app.request(base, { method: 'PUT' })).status, 405);
  assert.equal((await app.request(`${base}/bad-id`, { method: 'DELETE' })).status, 400);
  const remote = createApp({
    mode: 'remote',
    password: 'test-only-password',
    serveFrontend: false,
  });
  for (const method of ['GET', 'POST', 'DELETE']) {
    assert.equal(
      (await remote.request(method === 'DELETE' ? `${base}/${id}` : base, { method })).status,
      401,
    );
  }
});

test('移除收藏不删除原图，重新收藏、回收与恢复，彻底删除同步清理', async () => {
  await save();
  const removed = await app.request(`${base}/${id}`, { method: 'DELETE' });
  assert.deepEqual(await removed.json(), { resources: [] });
  assert.equal((await app.request(`/api/books/book/knowledge-maps/${id}`)).status, 200);
  await save();
  await app.request('/api/books/book/trash', { method: 'POST' });
  assert.equal((await app.request(base)).status, 404);
  assert.equal((await save()).status, 404);
  await app.request('/api/books/book/restore', { method: 'POST' });
  assert.equal((await (await app.request(base)).json()).resources.length, 1);
  const deletion = app.request('/api/books/book', { method: 'DELETE' });
  const saving = save();
  await deletion;
  assert.ok([200, 404].includes((await saving).status));
  await assert.rejects(stat(manifest), { code: 'ENOENT' });
  await assert.rejects(stat(image), { code: 'ENOENT' });
  assert.equal((await save()).status, 404);
});

test('损坏的资源清单不会被后续收藏覆盖', async () => {
  await atomicWrite(manifest, 'broken-json');
  await assert.rejects(saveBookResource('book', { imageId: id, title: '图' }));
  await assert.rejects(renameBookResource('book', id, { title: '新标题' }));
  assert.equal(await readFile(manifest, 'utf8'), 'broken-json');
});

const rename = (payload, imageId = id, bookId = 'book') =>
  app.request(`/api/books/${bookId}/resources/${imageId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

test('重命名持久保存并去除首尾空白，保留原图、收藏顺序和时间', async () => {
  await save();
  const before = (await (await app.request(base)).json()).resources[0];
  const bytes = await readFile(image);
  const response = await rename({ title: '  新标题  ' });
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).resources, [{ ...before, title: '新标题' }]);
  assert.equal(JSON.parse(await readFile(manifest, 'utf8')).resources[0].title, '新标题');
  assert.deepEqual(await readFile(image), bytes);
  assert.equal((await stat(manifest)).mode & 0o777, 0o600);
  await save();
  assert.equal((await (await app.request(base)).json()).resources[0].title, '新标题');
});

test('重命名拒绝空白、过长、非字符串和额外字段，不能修改其他书或未收藏图片', async () => {
  await save();
  for (const input of [null, {}, { title: '' }, { title: '   ' }, { title: 12 },
    { title: '字'.repeat(201) }, { title: '图', imageId: secondId }]) {
    assert.equal((await rename(input)).status, 400);
  }
  assert.equal((await rename({ title: '图' }, 'bad-id')).status, 400);
  assert.equal((await rename({ title: '图' }, secondId)).status, 404);
  assert.equal((await rename({ title: '图' }, id, 'other')).status, 404);
  assert.equal((await rename({ title: '图' }, id, 'missing')).status, 404);
  assert.equal((await rename({ title: '字'.repeat(200) })).status, 200);
  const remote = createApp({ mode: 'remote', password: 'test-only-password', serveFrontend: false });
  assert.equal((await remote.request(`${base}/${id}`, { method: 'PATCH' })).status, 401);
  await app.request('/api/books/book/trash', { method: 'POST' });
  assert.equal((await rename({ title: '图' })).status, 404);
});

test('并发重命名与移除不会恢复已移除的收藏或破坏其他收藏', async () => {
  await atomicWrite(join(knowledgeMapDirectoryPath('book'), `${secondId}.png`), Buffer.from('second'));
  await save();
  await save({ imageId: secondId, title: '另一张图' });
  const results = await Promise.all([
    rename({ title: '新名称' }),
    rename({ title: '另一个新名称' }, secondId),
    app.request(`${base}/${id}`, { method: 'DELETE' }),
  ]);
  assert.ok([200, 404].includes(results[0].status));
  assert.equal(results[1].status, 200);
  assert.equal(results[2].status, 200);
  const { resources } = await (await app.request(base)).json();
  assert.equal(resources.length, 1);
  assert.equal(resources[0].imageId, secondId);
  assert.equal(resources[0].title, '另一个新名称');
});
