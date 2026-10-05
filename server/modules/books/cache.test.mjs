import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, after } from 'node:test';

const directory = await mkdtemp(join(tmpdir(), 'epub-cache-'));
process.env.LEARNING_CENTER_DATA_DIR = directory;
const { createApp } = await import('../../app.js');
const { atomicWrite, bookPath } = await import('../../infrastructure/fs/files.js');
after(() => rm(directory, { recursive: true, force: true }));

test('EPUB 私有缓存重新验证、替换和删除', async () => {
  const app = createApp({ mode: 'local', serveFrontend: false });
  const path = bookPath('cache-book');
  await atomicWrite(path, Buffer.from('first epub'));
  const first = await app.request('/api/books/cache-book');
  const etag = first.headers.get('ETag');
  assert.ok(etag);
  assert.equal(first.headers.get('Cache-Control'), 'private, no-cache');
  assert.equal(await first.text(), 'first epub');
  const options = { headers: { 'If-None-Match': etag } };
  const unchanged = await app.request('/api/books/cache-book', options);
  assert.equal(unchanged.status, 304);
  assert.equal(unchanged.headers.get('Cache-Control'), 'private, no-cache');
  assert.equal(unchanged.headers.get('ETag'), etag);
  assert.equal(await unchanged.text(), '');
  const remote = createApp({ mode: 'remote', password: 'cache-test', serveFrontend: false });
  assert.equal((await remote.request('/api/books/cache-book', options)).status, 401);
  await atomicWrite(path, Buffer.from('replacement epub with new content'));
  const updated = await app.request('/api/books/cache-book', options);
  assert.equal(updated.status, 200);
  assert.notEqual(updated.headers.get('ETag'), etag);
  assert.equal(await updated.text(), 'replacement epub with new content');
  await rm(path);
  assert.equal((await app.request('/api/books/cache-book', options)).status, 404);
});

test('生成图片长时间私有缓存并支持 GET/HEAD ETag 重验证', async () => {
  const { knowledgeMapDirectoryPath, atomicWrite } =
    await import('../../infrastructure/fs/files.js');
  const { createApp } = await import('../../app.js');
  const { join } = await import('node:path');
  const id = '11111111-1111-4111-8111-111111111111';
  const image = join(knowledgeMapDirectoryPath('images'), `${id}.png`);
  await atomicWrite(image, Buffer.from('image'));
  const app = createApp({ mode: 'local', serveFrontend: false });
  const url = `/api/books/images/knowledge-maps/${id}`;
  const first = await app.request(url);
  assert.equal(first.headers.get('Cache-Control'), 'private, max-age=31536000, immutable');
  assert.equal(await first.text(), 'image');
  const etag = first.headers.get('ETag');
  assert.ok(etag);
  for (const method of ['GET', 'HEAD']) {
    const cached = await app.request(url, {
      method,
      headers: { 'If-None-Match': `"other", ${etag.replace(/^W\//, '')}` },
    });
    assert.equal(cached.status, 304);
    assert.equal(await cached.text(), '');
    assert.equal(cached.headers.get('ETag'), etag);
  }
  await atomicWrite(image, Buffer.from('updated-image'));
  const changed = await app.request(url, { headers: { 'If-None-Match': etag } });
  assert.equal(changed.status, 200);
  assert.notEqual(changed.headers.get('ETag'), etag);
  const remote = createApp({ mode: 'remote', password: 'test-cache', serveFrontend: false });
  assert.equal((await remote.request(url, { headers: { 'If-None-Match': etag } })).status, 401);
});
