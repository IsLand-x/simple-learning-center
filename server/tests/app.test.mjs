import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';

const testDataDirectory = await mkdtemp(join(tmpdir(), 'learning-center-test-'));
process.env.LEARNING_CENTER_DATA_DIR = testDataDirectory;
process.env.LEARNING_CENTER_MODE = 'local';

const [
  { createApp },
  { mutatePersistedState },
  { bookPath, initializeDataDirectories },
  { purgeExpiredTrashedBooks },
] = await Promise.all([
  import('../app.js'),
  import('../modules/state/stateStore.js'),
  import('../infrastructure/fs/files.js'),
  import('../modules/books/trash.js'),
]);

before(async () => {
  await initializeDataDirectories();
});

after(async () => {
  await rm(testDataDirectory, { force: true, recursive: true });
});

test('数据 API、API Key 迁移与远程认证', async (t) => {
  const app = createApp({ serveFrontend: false });

  await t.test('初始化并读取服务端状态', async () => {
    const persistedState = {
      state: {
        books: [],
        notes: [],
        openAIConfigs: [
          {
            id: 'provider-1',
            name: '测试模型',
            baseUrl: 'https://example.com/v1',
            models: ['test-model'],
            apiKey: 'test-key-1',
            createdAt: 1,
            updatedAt: 1,
          },
        ],
        webSearchConfig: { provider: 'jina', apiKey: 'test-search-key' },
      },
      version: 1,
    };
    const writeResponse = await app.request('/api/state?initialize=1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(persistedState),
    });
    assert.equal(writeResponse.status, 204);

    const readResponse = await app.request('/api/state');
    assert.equal(readResponse.status, 200);
    assert.deepEqual(await readResponse.json(), persistedState);

    const stateEtag = readResponse.headers.get('etag');
    assert.ok(stateEtag);
    const unchangedResponse = await app.request('/api/state', {
      headers: { 'If-None-Match': stateEtag },
    });
    assert.equal(unchangedResponse.status, 304);
    assert.equal(await unchangedResponse.text(), '');

    const libraryResponse = await app.request('/api/state/library');
    assert.equal(libraryResponse.status, 200);
    assert.deepEqual(Object.keys((await libraryResponse.clone().json()).state), ['books']);
    const libraryEtag = libraryResponse.headers.get('etag');
    assert.ok(libraryEtag);

    const preferenceResponse = await app.request('/api/state/preferences');
    const preferences = await preferenceResponse.json();
    assert.deepEqual(Object.keys(preferences.state), ['openAIConfigs', 'webSearchConfig']);
    const preferenceWriteResponse = await app.request('/api/state/preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: { themeMode: 'dark' }, version: 1 }),
    });
    assert.equal(preferenceWriteResponse.status, 204);

    const unchangedLibraryResponse = await app.request('/api/state/library', {
      headers: { 'If-None-Match': libraryEtag },
    });
    assert.equal(unchangedLibraryResponse.status, 304);
    const stateAfterPreferenceWrite = await (await app.request('/api/state')).json();
    assert.equal(stateAfterPreferenceWrite.state.themeMode, 'dark');
    assert.equal(stateAfterPreferenceWrite.state.openAIConfigs[0].apiKey, 'test-key-1');
    assert.equal(stateAfterPreferenceWrite.state.notes.length, 0);
  });

  await t.test('API Key 导入导出接口已移除，已有配置保持不变', async () => {
    assert.equal((await app.request('/api/api-keys/export')).status, 404);
    assert.equal(
      (
        await app.request('/api/api-keys/import', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ openAIConfigs: [] }),
        })
      ).status,
      404,
    );
    const snapshot = await (await app.request('/api/state')).json();
    assert.equal(snapshot.state.openAIConfigs[0].apiKey, 'test-key-1');
    assert.equal(snapshot.state.webSearchConfig.apiKey, 'test-search-key');
  });

  await t.test('错误输入返回客户端错误', async () => {
    const malformedResponse = await app.request('/api/state', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: '{',
    });
    assert.equal(malformedResponse.status, 400);
    assert.deepEqual(await malformedResponse.json(), { error: 'JSON 数据格式不正确' });
  });

  await t.test('已下线内容源与独立视频接口返回 404', async () => {
    const removedRoutes = [
      ['POST', '/api/rss/fetch'],
      ['POST', '/api/rss/sources/resolve'],
      ['POST', '/api/rss/sources/fetch'],
      ['POST', '/api/rss/article'],
      ['POST', '/api/rss/digests/run'],
      ['POST', '/api/videos/import'],
      ['GET', '/api/source-credentials/bilibili'],
      ['PUT', '/api/source-credentials/bilibili'],
      ['POST', '/api/source-credentials/bilibili/verify'],
      ['DELETE', '/api/source-credentials/bilibili'],
    ];
    for (const [method, path] of removedRoutes) {
      const response = await app.request(path, { method });
      assert.equal(response.status, 404, `${method} ${path}`);
    }
  });

  await t.test('AI 任务在服务端运行并持久化对话', async () => {
    const aiApp = createApp({
      serveFrontend: false,
      aiJobRunner: async ({ onProgress }) => {
        const content = '服务端回答';
        onProgress({
          content: '正在生成',
          dialogueContent: [
            {
              type: 'message',
              role: 'assistant',
              status: 'in_progress',
              content: [{ type: 'output_text', text: '正在生成' }],
            },
          ],
          status: 'in_progress',
        });
        await new Promise((resolve) => setTimeout(resolve, 10));
        return {
          content,
          dialogueContent: [
            {
              type: 'message',
              role: 'assistant',
              status: 'completed',
              content: [{ type: 'output_text', text: content }],
            },
          ],
          status: 'completed',
        };
      },
    });
    const createResponse = await aiApp.request('/api/ai/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        configId: 'provider-1',
        model: 'test-model',
        bookId: 'book-1',
        conversationId: 'conversation-1',
        userMessage: {
          id: 'user-message-1',
          content: '请回答这个问题',
          createdAt: 100,
        },
        session: { title: '测试对话', createdAt: 100 },
        currentText: '当前章节正文',
      }),
    });
    assert.equal(createResponse.status, 404);

    const stateResponse = await aiApp.request('/api/state');
    const state = await stateResponse.json();
    state.state.books = [
      {
        id: 'book-1',
        kind: 'epub',
        title: '测试书籍',
        author: '作者',
        fileName: 'book.epub',
        fileSize: 1,
        createdAt: 1,
        updatedAt: 1,
        progress: 0,
        currentChapter: '第一章',
        toc: [],
      },
    ];
    await aiApp.request('/api/state', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state),
    });

    const acceptedResponse = await aiApp.request('/api/ai/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        configId: 'provider-1',
        model: 'test-model',
        bookId: 'book-1',
        conversationId: 'conversation-1',
        userMessage: {
          id: 'user-message-1',
          content: '请回答这个问题',
          createdAt: 100,
        },
        session: { title: '测试对话', createdAt: 100 },
        currentText: '当前章节正文',
      }),
    });
    assert.equal(acceptedResponse.status, 202);
    const acceptedJob = await acceptedResponse.json();

    const eventsResponse = await aiApp.request(`/api/ai/jobs/${acceptedJob.id}/events`);
    assert.match(eventsResponse.headers.get('content-type'), /^text\/event-stream/);
    assert.equal(eventsResponse.headers.get('x-accel-buffering'), 'no');
    const streamedJobs = (await eventsResponse.text())
      .split('\n\n')
      .map((event) => event.split('\n').find((line) => line.startsWith('data: ')))
      .filter(Boolean)
      .map((line) => JSON.parse(line.slice('data: '.length)));
    assert.ok(streamedJobs.some((job) => job.status === 'running' && job.content === '正在生成'));
    assert.equal(streamedJobs.at(-1).status, 'completed');

    let completedJob;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const response = await aiApp.request(`/api/ai/jobs/${acceptedJob.id}`);
      completedJob = await response.json();
      if (completedJob.status === 'completed') break;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    assert.equal(completedJob.status, 'completed');
    assert.equal(completedJob.content, '服务端回答');

    const completedStateResponse = await aiApp.request('/api/state');
    const completedState = await completedStateResponse.json();
    assert.deepEqual(
      completedState.state.chats.map((message) => [message.role, message.content]),
      [
        ['user', '请回答这个问题'],
        ['assistant', '服务端回答'],
      ],
    );
    assert.equal(completedState.state.chatSessions[0].id, 'conversation-1');

    const staleClientState = structuredClone(completedState);
    staleClientState.state.chats = staleClientState.state.chats.filter(
      (message) => message.role !== 'assistant',
    );
    await aiApp.request('/api/state', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(staleClientState),
    });
    const protectedStateResponse = await aiApp.request('/api/state');
    const protectedState = await protectedStateResponse.json();
    assert.equal(protectedState.state.chats.at(-1).content, '服务端回答');
  });

  await t.test('旧标签页不会覆盖新版书单', async () => {
    const currentState = await (await app.request('/api/state')).json();
    currentState.version = 24;
    currentState.state.bookLists = [
      {
        id: 'protected-list',
        name: '受保护书单',
        note: '服务端保存的备注',
        bookIds: ['book-2', 'book-1'],
        createdAt: 1,
        updatedAt: 2,
      },
    ];
    await app.request('/api/state', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(currentState),
    });

    const staleState = structuredClone(currentState);
    staleState.version = 23;
    staleState.state.themeMode = 'light';
    delete staleState.state.bookLists;
    await app.request('/api/state', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(staleState),
    });

    const protectedState = await (await app.request('/api/state')).json();
    assert.equal(protectedState.version, 24);
    assert.equal(protectedState.state.themeMode, 'light');
    assert.deepEqual(protectedState.state.bookLists[0].bookIds, ['book-2', 'book-1']);
    assert.equal(protectedState.state.bookLists[0].note, '服务端保存的备注');
  });

  await t.test('旧设备快照不会清除高亮、复活已删除高亮或回退阅读样式', async () => {
    const currentState = await (await app.request('/api/state')).json();
    currentState.version = 28;
    currentState.state.highlights = [
      {
        id: 'reader-sync-highlight',
        bookId: 'book-1',
        kind: 'highlight',
        text: '服务端的新高亮',
        cfi: 'epubcfi(/6/2)',
        chapter: '第一章',
        createdAt: 200,
        updatedAt: 200,
      },
    ];
    currentState.state.deletedHighlightTombstones = [];
    currentState.state.readerPreferences = { theme: 'ink', fontSize: 22 };
    currentState.state.readerPreferencesUpdatedAt = 200;
    currentState.state.readerStyleUpdatedAt = 200;
    currentState.state.readerLayoutUpdatedAt = 200;
    await app.request('/api/state', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(currentState),
    });

    const staleDeviceSnapshot = structuredClone(currentState);
    staleDeviceSnapshot.state.highlights = [];
    staleDeviceSnapshot.state.readerPreferences = { theme: 'paper', fontSize: 16 };
    staleDeviceSnapshot.state.readerPreferencesUpdatedAt = 100;
    staleDeviceSnapshot.state.readerStyleUpdatedAt = 100;
    staleDeviceSnapshot.state.readerLayoutUpdatedAt = 100;
    await app.request('/api/state', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(staleDeviceSnapshot),
    });

    let serverState = await (await app.request('/api/state')).json();
    assert.equal(serverState.state.highlights[0].text, '服务端的新高亮');
    assert.deepEqual(serverState.state.readerPreferences, { theme: 'ink', fontSize: 22 });

    const deletionSnapshot = structuredClone(serverState);
    deletionSnapshot.state.highlights = [];
    deletionSnapshot.state.deletedHighlightTombstones = [
      {
        highlightId: 'reader-sync-highlight',
        bookId: 'book-1',
        deletedAt: 300,
      },
    ];
    await app.request('/api/state', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(deletionSnapshot),
    });
    await app.request('/api/state', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(currentState),
    });

    serverState = await (await app.request('/api/state')).json();
    assert.equal(
      serverState.state.highlights.some((item) => item.id === 'reader-sync-highlight'),
      false,
    );
    assert.equal(
      serverState.state.deletedHighlightTombstones[0].highlightId,
      'reader-sync-highlight',
    );
  });

  await t.test('回收站阻止旧设备快照复活书籍，并支持恢复与彻底删除', async () => {
    const currentState = await (await app.request('/api/state')).json();
    const book = {
      id: 'trash-sync-book',
      kind: 'epub',
      title: '不会复活的书',
      author: '测试作者',
      fileName: 'trash-sync-book.epub',
      fileSize: 4,
      createdAt: 100,
      updatedAt: 100,
      progress: 42,
      currentChapter: '第二章',
      toc: [],
      coverDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB',
    };
    currentState.version = 25;
    currentState.state.books = [
      book,
      ...(currentState.state.books ?? []).filter((item) => item.id !== book.id),
    ];
    currentState.state.bookLists = [
      {
        id: 'trash-sync-list',
        name: '同步测试',
        note: '',
        bookIds: [book.id],
        createdAt: 100,
        updatedAt: 100,
      },
    ];
    currentState.state.trashedBooks = [];
    currentState.state.deletedBookTombstones = [];
    currentState.state.highlights = [
      {
        id: 'trash-sync-highlight',
        bookId: book.id,
        text: '保留的高亮',
        cfi: 'epubcfi(/6/2)',
        chapter: '第二章',
        createdAt: 100,
      },
    ];
    currentState.state.notes = [
      {
        id: 'trash-sync-note',
        bookId: book.id,
        title: '保留的笔记',
        content: '笔记正文',
        createdAt: 100,
        updatedAt: 100,
      },
    ];
    currentState.state.chats = [];
    currentState.state.chatSessions = [];
    currentState.state.readingSessions = [];
    await app.request('/api/state', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(currentState),
    });
    await writeFile(bookPath(book.id), new Uint8Array([1, 2, 3, 4]));
    const externalizedStateResponse = await app.request('/api/state');
    const externalizedStateText = await externalizedStateResponse.text();
    assert.equal(externalizedStateText.includes(book.coverDataUrl), false);
    const externalizedState = JSON.parse(externalizedStateText);
    assert.equal(
      externalizedState.state.books.find((item) => item.id === book.id)?.coverDataUrl,
      `/api/books/${book.id}/cover`,
    );
    const coverResponse = await app.request(`/api/books/${book.id}/cover`);
    assert.equal(coverResponse.status, 200);
    assert.equal(coverResponse.headers.get('content-type'), 'image/png');
    assert.equal(coverResponse.headers.get('cache-control'), 'private, max-age=604800');
    assert.ok((await coverResponse.arrayBuffer()).byteLength > 0);
    const staleDeviceSnapshot = structuredClone(currentState);
    staleDeviceSnapshot.state.highlights = [];
    staleDeviceSnapshot.state.notes = [];

    const trashResponse = await app.request(`/api/books/${book.id}/trash`, { method: 'POST' });
    assert.equal(trashResponse.status, 200);
    assert.equal((await trashResponse.json()).book.id, book.id);
    let serverState = await (await app.request('/api/state')).json();
    assert.equal(
      serverState.state.books.some((item) => item.id === book.id),
      false,
    );
    assert.equal(serverState.state.trashedBooks[0].book.id, book.id);
    assert.equal(serverState.state.highlights[0].text, '保留的高亮');
    assert.equal(serverState.state.notes[0].content, '笔记正文');
    assert.deepEqual(serverState.state.bookLists[0].bookIds, []);
    assert.equal((await app.request(`/api/books/${book.id}`)).status, 200);

    await app.request('/api/state', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(staleDeviceSnapshot),
    });
    serverState = await (await app.request('/api/state')).json();
    assert.equal(
      serverState.state.books.some((item) => item.id === book.id),
      false,
    );
    assert.equal(serverState.state.trashedBooks[0].book.id, book.id);
    assert.equal(serverState.state.highlights[0].text, '保留的高亮');
    assert.equal(serverState.state.notes[0].content, '笔记正文');

    const restoreResponse = await app.request(`/api/books/${book.id}/restore`, { method: 'POST' });
    assert.equal(restoreResponse.status, 200);
    serverState = await (await app.request('/api/state')).json();
    assert.equal(
      serverState.state.books.some((item) => item.id === book.id),
      true,
    );
    assert.equal(serverState.state.trashedBooks.length, 0);
    assert.deepEqual(serverState.state.bookLists[0].bookIds, [book.id]);

    const snapshotMissingActiveBook = structuredClone(serverState);
    snapshotMissingActiveBook.state.books = snapshotMissingActiveBook.state.books.filter(
      (item) => item.id !== book.id,
    );
    await app.request('/api/state', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(snapshotMissingActiveBook),
    });
    serverState = await (await app.request('/api/state')).json();
    assert.equal(
      serverState.state.books.some((item) => item.id === book.id),
      true,
    );

    await app.request(`/api/books/${book.id}/trash`, { method: 'POST' });
    const deleteResponse = await app.request(`/api/books/${book.id}`, { method: 'DELETE' });
    assert.equal(deleteResponse.status, 200);
    const deleteResult = await deleteResponse.json();
    assert.equal(deleteResult.bookId, book.id);
    serverState = await (await app.request('/api/state')).json();
    assert.equal(serverState.state.trashedBooks.length, 0);
    assert.equal(
      serverState.state.highlights.some((item) => item.bookId === book.id),
      false,
    );
    assert.equal(
      serverState.state.notes.some((item) => item.bookId === book.id),
      false,
    );
    assert.equal(
      serverState.state.deletedBookTombstones.some((item) => item.bookId === book.id),
      true,
    );
    assert.equal((await app.request(`/api/books/${book.id}`)).status, 404);
    assert.equal((await app.request(`/api/books/${book.id}/cover`)).status, 404);

    await app.request('/api/state', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(staleDeviceSnapshot),
    });
    serverState = await (await app.request('/api/state')).json();
    assert.equal(
      serverState.state.books.some((item) => item.id === book.id),
      false,
    );
    assert.equal(
      serverState.state.highlights.some((item) => item.bookId === book.id),
      false,
    );
    assert.equal(
      serverState.state.notes.some((item) => item.bookId === book.id),
      false,
    );
  });

  await t.test('回收站仅自动清理超过 30 天的书籍', async () => {
    const currentState = await (await app.request('/api/state')).json();
    const makeBook = (id) => ({
      id,
      kind: 'epub',
      title: id,
      author: '测试作者',
      fileName: `${id}.epub`,
      fileSize: 1,
      createdAt: 1,
      updatedAt: 1,
      progress: 0,
      currentChapter: '开始阅读',
      toc: [],
    });
    const expiredBook = makeBook('expired-trash-book');
    const recentBook = makeBook('recent-trash-book');
    currentState.version = 25;
    currentState.state.books = [expiredBook, recentBook, ...(currentState.state.books ?? [])];
    await app.request('/api/state', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(currentState),
    });
    await Promise.all([
      writeFile(bookPath(expiredBook.id), new Uint8Array([1])),
      writeFile(bookPath(recentBook.id), new Uint8Array([2])),
    ]);
    await app.request(`/api/books/${expiredBook.id}/trash`, { method: 'POST' });
    await app.request(`/api/books/${recentBook.id}/trash`, { method: 'POST' });
    const now = Date.now();
    await mutatePersistedState((persistedState) => {
      const expiredEntry = persistedState.state.trashedBooks.find(
        (item) => item.book.id === expiredBook.id,
      );
      const recentEntry = persistedState.state.trashedBooks.find(
        (item) => item.book.id === recentBook.id,
      );
      expiredEntry.deletedAt = now - 30 * 24 * 60 * 60 * 1_000 - 1;
      recentEntry.deletedAt = now - 29 * 24 * 60 * 60 * 1_000;
    });

    const deletedBookIds = await purgeExpiredTrashedBooks({ now: () => now });
    assert.deepEqual(deletedBookIds, [expiredBook.id]);
    const serverState = await (await app.request('/api/state')).json();
    assert.equal(
      serverState.state.trashedBooks.some((item) => item.book.id === expiredBook.id),
      false,
    );
    assert.equal(
      serverState.state.trashedBooks.some((item) => item.book.id === recentBook.id),
      true,
    );
    assert.equal((await app.request(`/api/books/${expiredBook.id}`)).status, 404);
    assert.equal((await app.request(`/api/books/${recentBook.id}`)).status, 200);
  });

  await t.test('远程模式保护页面与 API', async () => {
    const remoteApp = createApp({
      mode: 'remote',
      username: 'reader',
      password: 'test-password',
      serveFrontend: false,
    });
    const sessionResponse = await remoteApp.request('/api/auth/session');
    assert.equal(sessionResponse.status, 200);
    assert.deepEqual(await sessionResponse.json(), {
      authenticated: false,
      mode: 'remote',
      username: null,
    });

    const unauthorizedResponse = await remoteApp.request('/api/health');
    assert.equal(unauthorizedResponse.status, 401);
    assert.equal(unauthorizedResponse.headers.has('www-authenticate'), false);

    const failedLoginResponse = await remoteApp.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'reader',
        password: 'wrong-password',
      }),
    });
    assert.equal(failedLoginResponse.status, 401);

    const loginResponse = await remoteApp.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'reader',
        password: 'test-password',
      }),
    });
    assert.equal(loginResponse.status, 200);
    const sessionCookie = loginResponse.headers.get('set-cookie')?.split(';', 1)[0];
    assert.ok(sessionCookie?.startsWith('learning_center_session='));
    assert.match(loginResponse.headers.get('set-cookie'), /HttpOnly/i);
    assert.match(loginResponse.headers.get('set-cookie'), /SameSite=Strict/i);
    assert.match(loginResponse.headers.get('set-cookie'), /Secure/i);

    const authorizedResponse = await remoteApp.request('/api/health', {
      headers: { Cookie: sessionCookie },
    });
    assert.equal(authorizedResponse.status, 200);
    assert.equal((await authorizedResponse.json()).mode, 'remote');

    const updateResponse = await remoteApp.request('/api/auth/credentials', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Cookie: sessionCookie,
      },
      body: JSON.stringify({
        password: 'updated-password',
      }),
    });
    assert.equal(updateResponse.status, 200);
    assert.deepEqual(await updateResponse.json(), { username: 'reader' });
    const updatedSessionCookie = updateResponse.headers.get('set-cookie')?.split(';', 1)[0];
    assert.ok(updatedSessionCookie?.startsWith('learning_center_session='));

    const expiredSessionResponse = await remoteApp.request('/api/health', {
      headers: { Cookie: sessionCookie },
    });
    assert.equal(expiredSessionResponse.status, 401);
    const updatedSessionResponse = await remoteApp.request('/api/auth/session', {
      headers: { Cookie: updatedSessionCookie },
    });
    assert.deepEqual(await updatedSessionResponse.json(), {
      authenticated: true,
      mode: 'remote',
      username: 'reader',
    });

    const storedAuth = await readFile(join(testDataDirectory, 'auth.json'), 'utf8');
    assert.equal(storedAuth.includes('test-password'), false);
    assert.equal(storedAuth.includes('updated-password'), false);
    assert.equal((await stat(join(testDataDirectory, 'auth.json'))).mode & 0o777, 0o600);

    const logoutResponse = await remoteApp.request('/api/auth/logout', {
      method: 'POST',
      headers: { Cookie: updatedSessionCookie },
    });
    assert.equal(logoutResponse.status, 204);
    assert.match(logoutResponse.headers.get('set-cookie'), /Max-Age=0/i);
  });
});
