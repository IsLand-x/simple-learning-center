import assert from 'node:assert/strict';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
const directory = await mkdtemp(join(tmpdir(), 'book-share-'));
process.env.LEARNING_CENTER_DATA_DIR = directory;
const { createApp } = await import('../../app.js');
const { atomicWrite, bookPath, coverDirectoryPath } =
  await import('../../infrastructure/fs/files.js');
after(() => rm(directory, { recursive: true, force: true }));

test('分享只公开明确授权的书籍，匿名读取、撤销、删除和恢复', async () => {
  await atomicWrite(
    join(directory, 'state.json'),
    JSON.stringify({
      version: 36,
      state: {
        books: [
          {
            id: 'shared',
            title: '朋友的书',
            author: '作者',
            fileSize: 4,
            progress: 75,
            currentCfi: 'private',
            createdAt: 1,
            updatedAt: 1,
          },
        ],
        notes: [],
        highlights: [],
        readingSessions: [],
      },
    }),
  );
  await atomicWrite(bookPath('shared'), Buffer.from('epub'));
  await atomicWrite(join(coverDirectoryPath('shared'), 'cover.png'), Buffer.from('cover'));
  const local = createApp({ mode: 'local', serveFrontend: false });
  const remote = createApp({ mode: 'remote', password: 'test-share', serveFrontend: false });
  assert.equal((await remote.request('/api/books/shared/share', { method: 'POST' })).status, 401);
  assert.equal((await remote.request('/api/books/shared')).status, 401);
  const links = await Promise.all(
    [1, 2].map(async () =>
      (await local.request('/api/books/shared/share', { method: 'POST' })).json(),
    ),
  );
  assert.deepEqual(links[0], links[1]);
  assert.match(links[0].token, /^[a-f0-9]{64}$/);
  assert.equal((await stat(join(directory, 'book-shares.json'))).mode & 0o777, 0o600);
  const path = `/api/public/book-shares/${links[0].token}`;
  const metadata = await remote.request(path);
  assert.deepEqual(await metadata.json(), { title: '朋友的书', author: '作者' });
  assert.equal(metadata.headers.get('Cache-Control'), 'private, no-store');
  const epub = await remote.request(`${path}/epub`);
  assert.equal(await epub.text(), 'epub');
  assert.match(epub.headers.get('Content-Disposition'), /^attachment;/);
  assert.equal((await remote.request(`${path}/cover`)).status, 200);
  assert.equal((await remote.request(`${path}/notes`)).status, 401);
  assert.equal((await remote.request(path, { method: 'POST' })).status, 405);
  assert.equal((await remote.request('/api/public/book-shares/shared')).status, 404);
  assert.equal((await remote.request('/api/public/book-shares/shared/douban')).status, 404);
  assert.equal((await remote.request(`/api/public/book-shares/${'0'.repeat(64)}`)).status, 404);
  assert.equal((await local.request('/api/books/shared/share', { method: 'DELETE' })).status, 204);
  assert.equal((await remote.request(path)).status, 404);
  assert.equal((await remote.request(`${path}/epub`)).status, 404);
  assert.equal((await remote.request(`${path}/douban`)).status, 404);
  const next = await (await local.request('/api/books/shared/share', { method: 'POST' })).json();
  assert.notEqual(next.token, links[0].token);
  assert.equal((await local.request('/api/books/shared/trash', { method: 'POST' })).status, 200);
  assert.equal((await remote.request(`/api/public/book-shares/${next.token}`)).status, 404);
  assert.equal((await local.request('/api/books/shared/restore', { method: 'POST' })).status, 200);
  assert.equal((await remote.request(`/api/public/book-shares/${next.token}`)).status, 404);
});
