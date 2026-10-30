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

test('书架及进度分区保存不访问其他正文资源，也不会丢失未知状态或服务器删除记录', async () => {
  const note = {
    id: 'isolated-note',
    bookId: 'isolated-book',
    updatedAt: 1,
    contentFile: 'notes/isolated-book/note.md',
  };
  const untouched = {
    notes: [note],
    rssItems: [{ id: 'large-item', fullContentText: '无关正文'.repeat(10000) }],
    extension: { nested: ['保留'] },
  };
  await atomicWrite(join(directory, note.contentFile), '用户直接编辑的 Markdown');
  await atomicWrite(
    join(directory, 'state.json'),
    JSON.stringify({
      formatVersion: 1,
      persistedState: {
        version: 40,
        deletedConversationIds: ['removed-session'],
        state: { ...untouched, books: [{ id: 'isolated-book', title: '原书名', updatedAt: 1 }] },
      },
    }),
  );
  const app = createApp({ mode: 'local', serveFrontend: false });
  for (const [domain, state] of [
    ['library', { books: [{ id: 'isolated-book', title: '新书名', updatedAt: 2 }], notes: [] }],
    ['reading', { readingSessions: [{ id: 'reading', bookId: 'isolated-book' }], notes: [] }],
    [
      'highlights',
      {
        highlights: [{ id: 'highlight', bookId: 'isolated-book', createdAt: 2, updatedAt: 2 }],
        notes: [],
      },
    ],
  ]) {
    assert.equal(
      (
        await app.request(`/api/state/${domain}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ version: 40, state }),
        })
      ).status,
      204,
    );
    const saved = JSON.parse(await readFile(join(directory, 'state.json'), 'utf8')).persistedState;
    for (const [key, value] of Object.entries(untouched)) assert.deepEqual(saved.state[key], value);
    assert.deepEqual(saved.deletedConversationIds, ['removed-session']);
    assert.equal(
      await readFile(join(directory, note.contentFile), 'utf8'),
      '用户直接编辑的 Markdown',
    );
  }
  const saved = JSON.parse(await readFile(join(directory, 'state.json'), 'utf8')).persistedState;
  assert.equal(saved.state.books[0].title, '新书名');
  assert.equal(saved.state.readingSessions[0].id, 'reading');
  assert.equal(saved.state.highlights[0].id, 'highlight');
});

test('书架读取不被未完成的后台写入阻塞，写入提交后立即读取新版本', async () => {
  await writePersistedState({
    version: 40,
    state: { books: [{ id: 'read-committed', title: '已提交', updatedAt: 1 }], notes: [] },
  });
  const app = createApp({ mode: 'local', serveFrontend: false });
  const ready = Promise.withResolvers();
  const release = Promise.withResolvers();
  const writing = mutatePersistedState(
    async (snapshot) => {
      snapshot.state.books[0].title = '新提交';
      ready.resolve();
      await release.promise;
    },
    { preserveResourceFiles: true },
  );
  await ready.promise;
  try {
    const response = await Promise.race([
      app.request('/api/state/library'),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('读取被写队列阻塞')), 1000).unref(),
      ),
    ]);
    assert.equal((await response.json()).state.books[0].title, '已提交');
  } finally {
    release.resolve();
    await writing;
  }
  assert.equal(
    (await (await app.request('/api/state/library')).json()).state.books[0].title,
    '新提交',
  );
});

test('仅书架和完整状态读取执行注入的回收站清理，并在条件请求前完成', async () => {
  await writePersistedState({ version: 42, state: { books: [], notes: [], themeMode: 'light' } });
  let purgeCount = 0;
  const app = createApp({
    mode: 'local',
    serveFrontend: false,
    purgeBookTrash: async () => {
      purgeCount += 1;
      return [];
    },
  });
  assert.equal((await app.request('/api/state/preferences')).status, 200);
  assert.equal((await app.request('/api/state/unknown')).status, 404);
  assert.equal(purgeCount, 0);

  const library = await app.request('/api/state/library');
  assert.equal(library.status, 200);
  assert.equal(purgeCount, 1);
  const etag = library.headers.get('ETag');
  assert.ok(etag);
  assert.equal(
    (await app.request('/api/state/library', { headers: { 'If-None-Match': etag } })).status,
    304,
  );
  assert.equal(purgeCount, 2);
  assert.equal((await app.request('/api/state')).status, 200);
  assert.equal(purgeCount, 3);
});
