import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';

const directory = await mkdtemp(join(tmpdir(), 'learning-openapi-'));
process.env.LEARNING_CENTER_DATA_DIR = directory;
const { createApp } = await import('../app.js');
const { readPersistedState, writePersistedState } = await import('../modules/state/stateStore.js');
const fixture = await readFile(
  new URL('../../tests/fixtures/openapi-sample.epub', import.meta.url),
);
after(() => rm(directory, { recursive: true, force: true }));
const managementHeaders = { 'X-Learning-Center-Request': '1' };

test('开放接口鉴权、导入、状态保护与 Token 生命周期', async () => {
  const app = createApp({ mode: 'local', serveFrontend: false });
  const managementPath = '/api/settings/openapi-token';
  const uploadPath = '/api/openapi/v1/books?filename=sample.epub';
  assert.equal((await app.request(uploadPath, { method: 'POST' })).status, 401);
  assert.equal((await app.request(managementPath, { method: 'POST' })).status, 403);
  assert.equal(
    (
      await app.request(managementPath, {
        method: 'POST',
        headers: { ...managementHeaders, Origin: 'https://untrusted.example' },
      })
    ).status,
    403,
  );
  const generated = await (
    await app.request(managementPath, { method: 'POST', headers: managementHeaders })
  ).json();
  assert.match(generated.token, /^lc_/);
  const stored = await readFile(join(directory, 'openapi-token.json'), 'utf8');
  assert.equal(JSON.parse(stored).token, generated.token);
  assert.equal(JSON.parse(stored).hash.length, 64);
  assert.equal((await stat(join(directory, 'openapi-token.json'))).mode & 0o777, 0o600);
  const status = await (await app.request(managementPath)).json();
  assert.equal(status.configured, true);
  assert.equal(status.token, undefined);
  const headers = {
    Authorization: `Bearer ${generated.token}`,
    'Content-Type': 'application/epub+zip',
  };
  assert.equal(
    (await app.request(uploadPath, { method: 'POST', headers, body: fixture })).status,
    409,
  );
  assert.deepEqual(await readdir(join(directory, 'books')), []);
  await writePersistedState({ version: 25, state: { books: [], notes: [] } });
  const response = await app.request(uploadPath, { method: 'POST', headers, body: fixture });
  assert.equal(response.status, 201);
  const { book } = await response.json();
  assert.equal(book.title, '接口测试书籍');
  assert.equal(book.author, '测试作者');
  assert.equal(book.toc[0].href, 'EPUB/chapter.xhtml');
  assert.deepEqual(await readFile(join(directory, 'books', `${book.id}.epub`)), fixture);
  await writePersistedState({ version: 25, state: { books: [], notes: [] } });
  assert.equal((await readPersistedState()).state.books[0].id, book.id);
  const restarted = createApp({ mode: 'remote', serveFrontend: false });
  assert.equal((await restarted.request('/api/state', { headers })).status, 401);
  assert.equal(
    (
      await restarted.request(managementPath, {
        method: 'POST',
        headers: { ...headers, ...managementHeaders },
      })
    ).status,
    401,
  );
  assert.equal(
    (await restarted.request(uploadPath, { method: 'POST', headers, body: fixture })).status,
    201,
  );
  assert.equal(
    (
      await app.request(uploadPath, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'text/plain' },
        body: fixture,
      })
    ).status,
    415,
  );
  assert.equal(
    (await app.request(uploadPath, { method: 'POST', headers, body: 'invalid epub' })).status,
    400,
  );
  assert.equal((await app.request(uploadPath, { method: 'POST', headers })).status, 400);
  assert.equal(
    (
      await app.request(uploadPath, {
        method: 'POST',
        headers: { ...headers, 'Content-Length': String(101 * 1024 * 1024) },
        body: fixture,
      })
    ).status,
    413,
  );
  assert.equal(
    (
      await app.request('/api/openapi/v1/books?filename=../bad.epub', {
        method: 'POST',
        headers,
        body: fixture,
      })
    ).status,
    400,
  );
  assert.equal((await readdir(join(directory, 'books'))).length, 2);
  const login = await restarted.request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'password' }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  assert.equal(
    (
      await restarted.request(managementPath, {
        headers: { Cookie: cookie, Origin: 'https://localhost' },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await restarted.request(uploadPath, {
        method: 'POST',
        headers: { Cookie: cookie, 'Content-Type': 'application/epub+zip' },
        body: fixture,
      })
    ).status,
    401,
  );
  const next = await (
    await app.request(managementPath, { method: 'POST', headers: managementHeaders })
  ).json();
  assert.notEqual(next.token, generated.token);
  assert.equal(
    (await restarted.request(uploadPath, { method: 'POST', headers, body: fixture })).status,
    401,
  );
  await app.request(managementPath, { method: 'DELETE', headers: managementHeaders });
  assert.equal(
    (
      await restarted.request(uploadPath, {
        method: 'POST',
        headers: { ...headers, Authorization: `Bearer ${next.token}` },
        body: fixture,
      })
    ).status,
    401,
  );
});
