import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { mkdtemp, readFile, rm, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';

const directory = await mkdtemp(join(tmpdir(), 'device-sync-test-'));
process.env.LEARNING_CENTER_DATA_DIR = directory;
process.env.LEARNING_CENTER_MODE = 'local';
const { createApp } = await import('../../app.js');
const { readPersistedState } = await import('./stateStore.js');
const { getDatabase } = await import('../../db/index.js');
const schema = await import('../../db/schema.js');
const { atomicWrite } = await import('../../infrastructure/fs/files.js');

const book = {
  id: 'shared-book',
  kind: 'epub',
  title: '同一本书',
  author: '',
  fileName: 'book.epub',
  fileSize: 10,
  createdAt: 1,
  updatedAt: 10,
  progress: 5,
  currentCfi: 'epubcfi(/6/2)',
  currentChapter: '第一章',
  toc: [],
};
const term = {
  id: 'term-1',
  bookId: book.id,
  kind: 'term',
  text: '术语',
  cfi: 'epubcfi(/6/4)',
  chapter: '第一章',
  createdAt: 10,
  updatedAt: 10,
};

function request(app, path, method, body, headers = {}) {
  return app.request(path, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

after(() => rm(directory, { recursive: true, force: true }));

test('两台设备的进度和术语以 SQLite 为准，旧快照不能回退', async () => {
  const app = createApp({ mode: 'local', serveFrontend: false });
  assert.equal(
    (
      await request(app, '/api/state?initialize=1', 'PUT', {
        version: 42,
        state: { books: [book], highlights: [], notes: [] },
      })
    ).status,
    204,
  );

  const library = await (await app.request('/api/state/library')).json();
  const highlights = await (await app.request('/api/state/highlights')).json();
  const staleLibrary = structuredClone(library);
  const staleHighlights = structuredClone(highlights);

  library.state.books[0] = {
    ...library.state.books[0],
    progress: 48,
    currentCfi: 'epubcfi(/6/8)',
    updatedAt: 30,
  };
  highlights.state.highlights = [term];
  assert.equal((await request(app, '/api/state/library', 'PUT', library)).status, 204);
  assert.equal((await request(app, '/api/state/highlights', 'PUT', highlights)).status, 204);

  const progressEtag = (await app.request('/api/state/library')).headers.get('etag');
  assert.equal(
    (await app.request('/api/state/library', { headers: { 'If-None-Match': progressEtag } }))
      .status,
    304,
  );
  const remoteLibrary = await (await app.request('/api/state/library')).json();
  const remoteHighlights = await (await app.request('/api/state/highlights')).json();
  assert.equal(remoteLibrary.state.books[0].progress, 48);
  assert.equal(remoteLibrary.state.books[0].currentCfi, 'epubcfi(/6/8)');
  assert.equal(remoteHighlights.state.highlights[0].text, '术语');

  highlights.state.highlights = [{ ...term, definition: '手改释义', updatedAt: 40 }];
  assert.equal((await request(app, '/api/state/highlights', 'PUT', highlights)).status, 204);
  highlights.state.highlights = [];
  highlights.state.deletedHighlightTombstones = [
    { highlightId: term.id, bookId: book.id, deletedAt: 50 },
  ];
  assert.equal((await request(app, '/api/state/highlights', 'PUT', highlights)).status, 204);

  assert.equal((await request(app, '/api/state/library', 'PUT', staleLibrary)).status, 204);
  assert.equal((await request(app, '/api/state/highlights', 'PUT', staleHighlights)).status, 204);
  const afterStale = await (await app.request('/api/state/highlights')).json();
  assert.equal(
    afterStale.state.highlights.some((item) => item.id === term.id),
    false,
  );
  assert.equal(
    (await (await app.request('/api/state/library')).json()).state.books[0].progress,
    48,
  );

  const restored = structuredClone(staleHighlights);
  restored.state.highlights = [{ ...term, definition: '过时释义', updatedAt: 12 }];
  restored.state.deletedHighlightTombstones = [];
  assert.equal((await request(app, '/api/state/highlights', 'PUT', restored)).status, 204);
  assert.equal(
    (await (await app.request('/api/state/highlights')).json()).state.highlights.some(
      (item) => item.id === term.id,
    ),
    false,
  );

  const statePath = join(directory, 'state.json');
  await assert.rejects(readFile(statePath), { code: 'ENOENT' });
  await atomicWrite(
    statePath,
    JSON.stringify({
      formatVersion: 1,
      persistedState: {
        version: 99,
        state: { books: [{ ...book, progress: 1, currentCfi: 'epubcfi(/6/2)', updatedAt: 1_000 }] },
      },
    }),
  );
  await utimes(statePath, new Date(), new Date());
  assert.equal((await readPersistedState({ fields: ['books'] })).state.books[0].progress, 48);

  const { db } = getDatabase();
  db.update(schema.books)
    .set({ progress: 90, updatedAt: 80, currentCfi: 'epubcfi(/6/12)' })
    .where(eq(schema.books.id, book.id))
    .run();
  db.insert(schema.keyValues)
    .values({ key: '__stateRevision', value: '99' })
    .onConflictDoUpdate({ target: schema.keyValues.key, set: { value: '99' } })
    .run();
  await atomicWrite(
    statePath,
    '{"formatVersion":1,"persistedState":{"version":100,"state":{"books":[]}}}',
  );
  assert.equal((await readPersistedState({ fields: ['books'] })).state.books[0].progress, 90);
  assert.notEqual((await app.request('/api/state/library')).headers.get('etag'), progressEtag);
});
