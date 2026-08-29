import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import JSZip from 'jszip';

const testDataDirectory = await mkdtemp(join(tmpdir(), 'learning-center-test-'));
process.env.LEARNING_CENTER_DATA_DIR = testDataDirectory;
process.env.LEARNING_CENTER_MODE = 'local';

const [{ createApp }, { atomicWrite, bookPath, initializeDataDirectories }] = await Promise.all([
  import('./app.mjs'),
  import('./storage.mjs'),
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
        openAIConfigs: [{
          id: 'provider-1',
          name: '测试模型',
          baseUrl: 'https://example.com/v1',
          models: ['test-model'],
          apiKey: 'test-key-1',
          createdAt: 1,
          updatedAt: 1,
        }],
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
  });

  await t.test('导出并导入 API Key', async () => {
    const exportResponse = await app.request('/api/api-keys/export');
    assert.equal(exportResponse.status, 200);
    const exported = await exportResponse.json();
    assert.equal(exported.format, 'learning-center-api-keys');
    assert.equal(exported.openAIConfigs[0].apiKey, 'test-key-1');

    exported.openAIConfigs[0].apiKey = 'test-key-2';
    const importResponse = await app.request('/api/api-keys/import', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(exported),
    });
    assert.equal(importResponse.status, 200);
    assert.deepEqual(await importResponse.json(), {
      imported: { added: 0, updated: 1, webSearch: true },
    });

    const stateResponse = await app.request('/api/state');
    const state = await stateResponse.json();
    assert.equal(state.state.openAIConfigs[0].apiKey, 'test-key-2');
  });

  await t.test('错误输入返回客户端错误', async () => {
    const malformedResponse = await app.request('/api/state', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: '{',
    });
    assert.equal(malformedResponse.status, 400);
    assert.deepEqual(await malformedResponse.json(), { error: 'JSON 数据格式不正确' });

    const importResponse = await app.request('/api/api-keys/import', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ format: 'unknown', version: 1, openAIConfigs: [] }),
    });
    assert.equal(importResponse.status, 400);
  });

  await t.test('提供 Readium Publication 与 EPUB 章节资源', async () => {
    const zip = new JSZip();
    zip.file('mimetype', 'application/epub+zip');
    zip.file('META-INF/container.xml', `<?xml version="1.0"?>
      <container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0">
        <rootfiles><rootfile full-path="OPS/package.opf" media-type="application/oebps-package+xml"/></rootfiles>
      </container>`);
    zip.file('OPS/package.opf', `<?xml version="1.0"?>
      <package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="book-id">
        <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
          <dc:identifier id="book-id">test-readium-id</dc:identifier>
          <dc:title>Readium 测试书籍</dc:title>
          <dc:creator>测试作者</dc:creator>
          <dc:language>zh-CN</dc:language>
        </metadata>
        <manifest>
          <item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/>
          <item id="style" href="style.css" media-type="text/css"/>
          <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
        </manifest>
        <spine toc="ncx"><itemref idref="chapter"/></spine>
      </package>`);
    zip.file('OPS/toc.ncx', `<?xml version="1.0"?>
      <ncx xmlns="http://www.daisy.org/z3986/2005/ncx/">
        <navMap><navPoint id="chapter-1"><navLabel><text>第一章</text></navLabel><content src="chapter.xhtml"/></navPoint></navMap>
      </ncx>`);
    zip.file('OPS/chapter.xhtml', `<?xml version="1.0"?>
      <html xmlns="http://www.w3.org/1999/xhtml"><head><link rel="stylesheet" href="style.css"/></head>
      <body><h1>第一章</h1><p>这是用于验证 Readium 资源接口的正文。</p></body></html>`);
    zip.file('OPS/style.css', 'body { color: #222; }');
    await atomicWrite(bookPath('readium-book'), await zip.generateAsync({ type: 'nodebuffer' }));

    const manifestResponse = await app.request('/api/readium/books/readium-book/manifest.json');
    assert.equal(manifestResponse.status, 200);
    const manifest = await manifestResponse.json();
    assert.equal(manifest.metadata.title, 'Readium 测试书籍');
    assert.deepEqual(manifest.metadata.author, ['测试作者']);
    assert.equal(manifest.readingOrder[0].href, 'resources/OPS/chapter.xhtml');
    assert.equal(manifest.toc[0].title, '第一章');

    const chapterResponse = await app.request('/api/readium/books/readium-book/resources/OPS/chapter.xhtml');
    assert.equal(chapterResponse.status, 200);
    assert.equal(chapterResponse.headers.get('content-type'), 'application/xhtml+xml');
    assert.match(await chapterResponse.text(), /用于验证 Readium 资源接口/);

    const headResponse = await app.request('/api/readium/books/readium-book/resources/OPS/style.css', {
      method: 'HEAD',
    });
    assert.equal(headResponse.status, 200);
    assert.equal(headResponse.headers.get('content-type'), 'text/css');
    assert.equal(Number(headResponse.headers.get('content-length')), 'body { color: #222; }'.length);
  });

  await t.test('AI 任务在服务端运行并持久化对话', async () => {
    const aiApp = createApp({
      serveFrontend: false,
      aiJobRunner: async ({ onProgress }) => {
        onProgress({
          content: '正在生成',
          dialogueContent: [{
            type: 'message',
            role: 'assistant',
            status: 'in_progress',
            content: [{ type: 'output_text', text: '正在生成' }],
          }],
          status: 'in_progress',
        });
        await new Promise((resolve) => setTimeout(resolve, 10));
        return {
          content: '服务端回答',
          dialogueContent: [{
            type: 'message',
            role: 'assistant',
            status: 'completed',
            content: [{ type: 'output_text', text: '服务端回答' }],
          }],
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
    state.state.books = [{
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
    }];
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
      [['user', '请回答这个问题'], ['assistant', '服务端回答']],
    );
    assert.equal(completedState.state.chatSessions[0].id, 'conversation-1');

    const staleClientState = structuredClone(completedState);
    staleClientState.state.chats = staleClientState.state.chats
      .filter((message) => message.role !== 'assistant');
    await aiApp.request('/api/state', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(staleClientState),
    });
    const protectedStateResponse = await aiApp.request('/api/state');
    const protectedState = await protectedStateResponse.json();
    assert.equal(protectedState.state.chats.at(-1).content, '服务端回答');
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

  await t.test('局域网 HTTP 测试可显式关闭 Secure Cookie', async () => {
    const lanApp = createApp({
      mode: 'remote',
      username: 'admin',
      password: 'password',
      secureCookie: false,
      serveFrontend: false,
      authFile: join(testDataDirectory, 'lan-auth.json'),
    });
    const loginResponse = await lanApp.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'password' }),
    });
    assert.equal(loginResponse.status, 200);
    const setCookieHeader = loginResponse.headers.get('set-cookie');
    assert.match(setCookieHeader, /HttpOnly/i);
    assert.doesNotMatch(setCookieHeader, /; Secure/i);

    const sessionCookie = setCookieHeader?.split(';', 1)[0];
    const sessionResponse = await lanApp.request('/api/auth/session', {
      headers: { Cookie: sessionCookie },
    });
    assert.deepEqual(await sessionResponse.json(), {
      authenticated: true,
      mode: 'remote',
      username: 'admin',
    });
  });
});
