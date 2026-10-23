import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
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

test('读取偏好分区不会处理无关封面或笔记，完整读取仍保留正文和封面', async () => {
  const cover = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>').toString('base64');
  const noteFile = 'notes/book/note.md';
  await atomicWrite(join(directory, noteFile), '原创笔记正文');
  await atomicWrite(
    join(directory, 'state.json'),
    JSON.stringify({
      formatVersion: 1,
      persistedState: {
        version: 37,
        state: {
          themeMode: 'dark',
          books: [
            { id: 'book', title: '测试书', coverDataUrl: `data:image/svg+xml;base64,${cover}` },
          ],
          notes: [{ id: 'note', bookId: 'book', title: '测试笔记', contentFile: noteFile }],
        },
      },
    }),
  );
  const preferences = await readPersistedState({ fields: ['themeMode'] });
  assert.deepEqual(preferences, { version: 37, state: { themeMode: 'dark' } });
  await assert.rejects(readFile(join(directory, 'covers/book/cover.svg')), { code: 'ENOENT' });
  const full = await readPersistedState();
  assert.equal(full.state.notes[0].content, '原创笔记正文');
  assert.equal(full.state.books[0].coverDataUrl, '/api/books/book/cover');
});

test('对话元数据更新保留封面与 Markdown 引用，且不覆盖独立文件或队列中的笔记修改', async () => {
  const noteFile = 'notes/book/note.md';
  const coverFile = 'covers/book/cover.svg';
  await writePersistedState({
    version: 41,
    state: {
      books: [
        {
          id: 'book',
          title: '测试书',
          coverDataUrl: `data:image/svg+xml;base64,${Buffer.from('<svg/>').toString('base64')}`,
        },
      ],
      notes: [{ id: 'note', bookId: 'book', content: '原始笔记', updatedAt: 1 }],
    },
  });
  // An external Markdown edit must not be replaced by a hydrated empty value.
  await atomicWrite(join(directory, noteFile), '独立文件里的最新正文');
  const originalNote = await stat(join(directory, noteFile), { bigint: true });
  const originalCover = await stat(join(directory, coverFile), { bigint: true });
  const first = mutatePersistedState(
    (snapshot) => {
      snapshot.state.chats = [
        {
          id: 'user',
          bookId: 'book',
          conversationId: 'session',
          role: 'user',
          content: '提问',
          createdAt: 1,
        },
      ];
    },
    { preserveResourceFiles: true },
  );
  const second = mutatePersistedState((snapshot) => {
    assert.equal(snapshot.state.notes[0].content, '独立文件里的最新正文');
    snapshot.state.notes[0].content += '\n用户与 AI 同时编辑后的内容';
  });
  await first;
  assert.equal(
    (await stat(join(directory, coverFile), { bigint: true })).mtimeNs,
    originalCover.mtimeNs,
  );
  await second;
  const beforeReply = await stat(join(directory, noteFile), { bigint: true });
  assert.notEqual(beforeReply.mtimeNs, originalNote.mtimeNs);
  await mutatePersistedState(
    (snapshot) => {
      snapshot.state.chats.push({
        id: 'assistant',
        bookId: 'book',
        conversationId: 'session',
        role: 'assistant',
        content: '回复',
        createdAt: 2,
      });
    },
    { preserveResourceFiles: true },
  );
  assert.equal(
    (await stat(join(directory, noteFile), { bigint: true })).mtimeNs,
    beforeReply.mtimeNs,
  );
  const stored = JSON.parse(await readFile(join(directory, 'state.json'), 'utf8')).persistedState;
  assert.equal(stored.state.notes[0].contentFile, noteFile);
  assert.equal(Object.hasOwn(stored.state.notes[0], 'content'), false);
  assert.equal(stored.state.chats.length, 2);
  assert.equal(
    (await readPersistedState()).state.notes[0].content,
    '独立文件里的最新正文\n用户与 AI 同时编辑后的内容',
  );
});

test('并发分区读取相互隔离，并在提交后读取最新磁盘内容', async () => {
  const [library, preferences] = await Promise.all([
    readPersistedState({ fields: ['books'] }),
    readPersistedState({ fields: ['themeMode'] }),
  ]);
  assert.deepEqual(Object.keys(library.state), ['books']);
  assert.deepEqual(preferences.state, {});
  library.state.books[0].title = '修改读取结果';
  await mutatePersistedState((snapshot) => {
    assert.equal(snapshot.state.books[0].title, '原书名');
    snapshot.state.themeMode = 'dark';
  });
  assert.equal((await readPersistedState({ fields: ['themeMode'] })).state.themeMode, 'dark');
});

test('复用快照仍能发现同长度外部替换、文件删除和解析失败后的修复', async () => {
  const path = join(directory, 'state.json');
  const original = await readFile(path, 'utf8');
  const first = await readPersistedState({ fields: ['books'] });
  first.state.books[0].title = '调用者自己的修改';
  assert.equal((await readPersistedState({ fields: ['books'] })).state.books[0].title, '原书名');
  const replacement = original.replace('原书名', '新书名');
  assert.equal(Buffer.byteLength(replacement), Buffer.byteLength(original));
  await atomicWrite(path, replacement);
  assert.equal((await readPersistedState({ fields: ['books'] })).state.books[0].title, '新书名');
  await atomicWrite(path, '{invalid JSON');
  await assert.rejects(readPersistedState(), SyntaxError);
  await atomicWrite(path, original);
  assert.equal((await readPersistedState({ fields: ['books'] })).state.books[0].title, '原书名');
  await rm(path);
  assert.equal(await readPersistedState(), null);
  await atomicWrite(path, replacement);
  assert.equal((await readPersistedState({ fields: ['books'] })).state.books[0].title, '新书名');
});
