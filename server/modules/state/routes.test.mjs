import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';

const directory = await mkdtemp(join(tmpdir(), 'state-response-test-'));
process.env.LEARNING_CENTER_DATA_DIR = directory;
const { createApp } = await import('../../app.js');
const { writePersistedState, mutatePersistedState } = await import('./stateStore.js');
const { atomicWrite } = await import('../../infrastructure/fs/files.js');
after(() => rm(directory, { recursive: true, force: true }));

test('偏好保存不读取或重建无关封面和笔记，保留原有文件元数据及正文', async () => {
  const note = {
    id: 'note',
    bookId: 'book',
    title: '原始笔记',
    createdAt: 1,
    updatedAt: 1,
    contentFile: 'notes/book/note.md',
  };
  const missingNote = { ...note, id: 'missing', contentFile: 'notes/book/missing.md' };
  const cover = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>').toString('base64');
  const book = {
    id: 'preferences-resource-book',
    title: '封面无需处理',
    coverDataUrl: `data:image/svg+xml;base64,${cover}`,
  };
  await atomicWrite(join(directory, note.contentFile), '不能被偏好保存清空的笔记正文');
  await atomicWrite(
    join(directory, 'state.json'),
    JSON.stringify({
      formatVersion: 1,
      persistedState: {
        version: 40,
        state: { themeMode: 'light', books: [book], notes: [note, missingNote] },
      },
    }),
  );
  const app = createApp({ mode: 'local', serveFrontend: false });
  const response = await app.request('/api/state/preferences', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      version: 40,
      state: { themeMode: 'dark', notes: [], books: [] },
    }),
  });
  assert.equal(response.status, 204);
  const saved = JSON.parse(await readFile(join(directory, 'state.json'), 'utf8')).persistedState;
  assert.equal(saved.state.themeMode, 'dark');
  assert.deepEqual(saved.state.notes, [note, missingNote]);
  assert.deepEqual(saved.state.books, [book]);
  assert.equal(
    await readFile(join(directory, note.contentFile), 'utf8'),
    '不能被偏好保存清空的笔记正文',
  );
  await assert.rejects(readFile(join(directory, missingNote.contentFile)), { code: 'ENOENT' });
  await assert.rejects(readFile(join(directory, 'covers', book.id, 'cover.svg')), {
    code: 'ENOENT',
  });
});

test('状态分区压缩保持内容、鉴权与重验证语义，更新后不返回旧快照', async () => {
  await writePersistedState({
    version: 25,
    state: {
      books: [{ id: 'book', title: '书架压缩回归测试'.repeat(300), fileSize: 42 }],
      notes: [],
    },
  });
  const app = createApp({ mode: 'local', serveFrontend: false });
  const url = '/api/state/library';
  const plain = await app.request(url, { headers: { 'Accept-Encoding': 'identity' } });
  const body = await plain.text();
  const compressed = await app.request(url, { headers: { 'Accept-Encoding': 'gzip' } });
  assert.equal(compressed.headers.get('Content-Encoding'), 'gzip');
  assert.match(compressed.headers.get('Vary'), /Accept-Encoding/);
  assert.equal(compressed.headers.get('Cache-Control'), 'no-store');
  const bytes = Buffer.from(await compressed.arrayBuffer());
  assert.equal(gunzipSync(bytes).toString(), body);
  assert.ok(bytes.length < Buffer.byteLength(body) / 2);
  const etag = compressed.headers.get('ETag');
  assert.equal(etag, `W/${plain.headers.get('ETag')}`);
  for (const encoding of ['gzip', 'identity']) {
    const unchanged = await app.request(url, {
      headers: { 'Accept-Encoding': encoding, 'If-None-Match': `"other", ${etag}` },
    });
    assert.equal(unchanged.status, 304);
    assert.equal(await unchanged.text(), '');
  }
  await mutatePersistedState((snapshot) => {
    snapshot.state.books[0].title = '新书名';
  });
  const changed = await app.request(url, { headers: { 'If-None-Match': etag } });
  assert.equal(changed.status, 200);
  assert.notEqual(changed.headers.get('ETag'), plain.headers.get('ETag'));
  assert.equal((await changed.json()).state.books[0].title, '新书名');
  const remote = createApp({
    mode: 'remote',
    password: 'state-response-test',
    serveFrontend: false,
  });
  assert.equal((await remote.request(url, { headers: { 'Accept-Encoding': 'gzip' } })).status, 401);
});
