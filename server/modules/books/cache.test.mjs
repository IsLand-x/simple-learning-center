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

test('封面私有缓存支持条件请求，替换和删除不会返回旧封面', async () => {
  const { coverDirectoryPath } = await import('../../infrastructure/fs/files.js');
  const path = join(coverDirectoryPath('cover-book'), 'cover.svg');
  await atomicWrite(path, Buffer.from('<svg>first</svg>'));
  const app = createApp({ mode: 'local', serveFrontend: false });
  const url = '/api/books/cover-book/cover';
  const first = await app.request(url);
  const etag = first.headers.get('ETag');
  assert.ok(etag);
  assert.equal(first.headers.get('Cache-Control'), 'private, max-age=604800');
  assert.equal(await first.text(), '<svg>first</svg>');
  for (const method of ['GET', 'HEAD']) {
    const cached = await app.request(url, { method, headers: { 'If-None-Match': etag } });
    assert.equal(cached.status, 304);
    assert.equal(await cached.text(), '');
  }
  const remote = createApp({ mode: 'remote', password: 'cover-cache-test', serveFrontend: false });
  assert.equal((await remote.request(url, { headers: { 'If-None-Match': etag } })).status, 401);
  await atomicWrite(path, Buffer.from('<svg>replacement</svg>'));
  const changed = await app.request(url, { headers: { 'If-None-Match': etag } });
  assert.equal(changed.status, 200);
  assert.notEqual(changed.headers.get('ETag'), etag);
  assert.equal(await changed.text(), '<svg>replacement</svg>');
  await rm(path);
  assert.equal((await app.request(url, { headers: { 'If-None-Match': etag } })).status, 404);
});

test('图片 GET/HEAD 提供原图尺寸，HEAD 无正文且仍受认证保护', async () => {
  const { knowledgeMapDirectoryPath } = await import('../../infrastructure/fs/files.js');
  const id = '22222222-2222-4222-8222-222222222222';
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7XcAAAAASUVORK5CYII=',
    'base64',
  );
  await atomicWrite(join(knowledgeMapDirectoryPath('dimensions'), `${id}.png`), png);
  const app = createApp({ mode: 'local', serveFrontend: false });
  const url = `/api/books/dimensions/knowledge-maps/${id}`;
  for (const method of ['GET', 'HEAD']) {
    const response = await app.request(url, { method });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('X-Image-Width'), '1');
    assert.equal(response.headers.get('X-Image-Height'), '1');
    assert.equal(response.headers.get('Content-Length'), String(png.length));
    assert.equal((await response.arrayBuffer()).byteLength, method === 'HEAD' ? 0 : png.length);
  }
  const remote = createApp({ mode: 'remote', password: 'dimension-test', serveFrontend: false });
  const unauthorized = await remote.request(url, { method: 'HEAD' });
  assert.equal(unauthorized.status, 401);
  assert.equal(unauthorized.headers.get('X-Image-Width'), null);
  assert.equal((await app.request(url.replace(id, 'invalid'), { method: 'HEAD' })).status, 400);
});
