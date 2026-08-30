import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';

const testDataDirectory = await mkdtemp(join(tmpdir(), 'learning-center-test-'));
process.env.LEARNING_CENTER_DATA_DIR = testDataDirectory;
process.env.LEARNING_CENTER_MODE = 'local';

const [{ createApp }, { initializeDataDirectories }, { parseRssFeed }, { refreshPersistedRssFeed }] = await Promise.all([
  import('./app.mjs'),
  import('./storage.mjs'),
  import('./rss.mjs'),
  import('./rssScheduler.mjs'),
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

  await t.test('旧标签页不会覆盖新版 RSS 状态', async () => {
    const currentState = await (await app.request('/api/state')).json();
    currentState.version = 16;
    currentState.state.rssFolders = [];
    currentState.state.rssFeeds = [{
      id: 'protected-feed',
      title: '受保护订阅',
      url: 'https://example.com/protected.xml',
      type: 'article',
      createdAt: 1,
      updatedAt: 1,
    }];
    currentState.state.rssItems = [{
      id: 'protected-item',
      feedId: 'protected-feed',
      title: '受保护内容',
      publishedAt: 1,
      fetchedAt: 1,
      contentText: '正文',
    }];
    currentState.state.rssAnnotations = [{
      id: 'protected-annotation',
      itemId: 'protected-item',
      kind: 'highlight',
      text: '正文',
      startOffset: 0,
      endOffset: 2,
      createdAt: 1,
    }];
    currentState.state.rssPanelWidth = 420;
    await app.request('/api/state', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(currentState),
    });

    const staleState = structuredClone(currentState);
    staleState.version = 15;
    staleState.state.themeMode = 'dark';
    staleState.state.rssFeeds = [];
    staleState.state.rssItems = [];
    staleState.state.rssAnnotations = [];
    delete staleState.state.rssPanelWidth;
    await app.request('/api/state', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(staleState),
    });

    const protectedState = await (await app.request('/api/state')).json();
    assert.equal(protectedState.version, 16);
    assert.equal(protectedState.state.themeMode, 'dark');
    assert.equal(protectedState.state.rssFeeds[0].title, '受保护订阅');
    assert.equal(protectedState.state.rssItems[0].title, '受保护内容');
    assert.equal(protectedState.state.rssAnnotations[0].text, '正文');
    assert.equal(protectedState.state.rssPanelWidth, 420);
  });

  await t.test('旧标签页不会覆盖视频资料与学习记录', async () => {
    const currentState = await (await app.request('/api/state')).json();
    currentState.version = 18;
    currentState.state.videoResources = [{
      id: 'protected-video',
      youtubeVideoId: 'dQw4w9WgXcQ',
      url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      title: '受保护视频',
      channelTitle: '测试频道',
      durationSeconds: 60,
      captions: { originalLanguage: 'en', originalLanguageLabel: 'English', original: [], chinese: [] },
      createdAt: 1,
      updatedAt: 1,
    }];
    currentState.state.videoTimestampNotes = [{
      id: 'protected-video-note',
      videoId: 'protected-video',
      timeSeconds: 12,
      content: '受保护笔记',
      createdAt: 1,
      updatedAt: 1,
    }];
    currentState.state.videoPanelWidth = 440;
    await app.request('/api/state', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(currentState),
    });

    const staleState = structuredClone(currentState);
    staleState.version = 17;
    staleState.state.videoResources = [];
    staleState.state.videoTimestampNotes = [];
    delete staleState.state.videoPanelWidth;
    await app.request('/api/state', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(staleState),
    });

    const protectedState = await (await app.request('/api/state')).json();
    assert.equal(protectedState.version, 18);
    assert.equal(protectedState.state.videoResources[0].title, '受保护视频');
    assert.equal(protectedState.state.videoTimestampNotes[0].content, '受保护笔记');
    assert.equal(protectedState.state.videoPanelWidth, 440);
  });

  await t.test('服务端定时刷新持久化历史内容并防止旧快照覆盖新条目', async () => {
    const stateBeforeRefresh = await (await app.request('/api/state')).json();
    stateBeforeRefresh.version = 16;
    stateBeforeRefresh.state.rssFeeds = [{
      id: 'scheduled-feed',
      title: '定时订阅',
      url: 'https://example.com/scheduled.xml',
      type: 'article',
      fetchFullContent: true,
      createdAt: 1,
      updatedAt: 1,
    }];
    stateBeforeRefresh.state.rssItems = [{
      id: 'scheduled-feed:existing',
      feedId: 'scheduled-feed',
      title: '已有内容',
      link: 'https://example.com/existing',
      publishedAt: 1,
      fetchedAt: 1,
      contentText: '旧正文',
      readAt: 2,
    }];
    await app.request('/api/state', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(stateBeforeRefresh),
    });
    const staleBrowserSnapshot = structuredClone(stateBeforeRefresh);

    const result = await refreshPersistedRssFeed('scheduled-feed', {
      fetchFeed: async (url) => ({
        title: '定时订阅',
        description: '服务端刷新结果',
        siteUrl: 'https://example.com/',
        feedUrl: url,
        fetchedAt: 100,
        items: [{
          id: 'fresh',
          title: '新内容',
          link: 'https://example.com/fresh',
          author: '',
          publishedAt: 100,
          contentText: '新正文',
        }],
      }),
      fetchArticle: async (url, options) => {
        assert.equal(options.readerConfig.apiKey, 'test-search-key');
        return {
        title: '新内容',
        byline: '测试作者',
        excerpt: '完整原文摘要',
        contentHtml: '<article><h2>完整原文</h2><p>服务端补抓的正文</p></article>',
        contentText: '完整原文\n服务端补抓的正文',
        url,
        fetchedAt: 101,
        };
      },
      logger: { warn() {} },
    });
    assert.equal(result.status, 'refreshed');

    await app.request('/api/state', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(staleBrowserSnapshot),
    });
    const refreshedState = await (await app.request('/api/state')).json();
    assert.equal(refreshedState.state.rssFeeds[0].lastFetchedAt, 100);
    assert.equal(refreshedState.state.rssFeeds[0].description, '服务端刷新结果');
    assert.ok(refreshedState.state.rssItems.some((item) => item.id === 'scheduled-feed:fresh'));
    assert.equal(
      refreshedState.state.rssItems.find((item) => item.id === 'scheduled-feed:fresh')?.fullContentText,
      '完整原文\n服务端补抓的正文',
    );
    assert.ok(refreshedState.state.rssItems.some((item) => item.id === 'scheduled-feed:existing' && item.readAt === 2));
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

  await t.test('通过服务端导入 YouTube 视频元数据与字幕', async () => {
    const videoApp = createApp({
      serveFrontend: false,
      youtubeVideoFetcher: async (url) => ({
        youtubeVideoId: 'dQw4w9WgXcQ',
        url,
        title: '测试视频',
        channelTitle: '测试频道',
        durationSeconds: 120,
        captions: { originalLanguage: 'en', originalLanguageLabel: 'English', original: [], chinese: [] },
      }),
    });
    const response = await videoApp.request('/api/videos/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }),
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).title, '测试视频');
  });

  await t.test('YouTube 受控上游错误会返回可操作提示', async () => {
    const videoApp = createApp({
      serveFrontend: false,
      youtubeVideoFetcher: async () => {
        throw Object.assign(new Error('服务端连接 YouTube 超时，请配置代理'), {
          status: 504,
          expose: true,
        });
      },
    });
    const response = await videoApp.request('/api/videos/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }),
    });
    assert.equal(response.status, 504);
    assert.deepEqual(await response.json(), { error: '服务端连接 YouTube 超时，请配置代理' });
  });

  await t.test('解析并通过服务端获取 RSS 与 Atom 订阅源', async () => {
    const parsed = parseRssFeed(`<?xml version="1.0" encoding="UTF-8"?>
      <rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
        <channel>
          <title>测试订阅</title>
          <link>https://example.com/</link>
          <description>用于测试的订阅源</description>
          <item>
            <guid>item-1</guid>
            <title>第一篇文章</title>
            <link>/posts/1</link>
            <pubDate>Sun, 30 Aug 2026 02:00:00 GMT</pubDate>
            <content:encoded><![CDATA[<p>正文 <strong>内容</strong></p><img src="/images/cover.jpg" /><img data-src="https://cdn.example.com/detail.png" />]]></content:encoded>
          </item>
        </channel>
      </rss>`, 'https://example.com/feed.xml', 100);
    assert.equal(parsed.title, '测试订阅');
    assert.equal(parsed.siteUrl, 'https://example.com/');
    assert.equal(parsed.items[0].link, 'https://example.com/posts/1');
    assert.equal(parsed.items[0].contentText, '正文 内容');
    assert.match(parsed.items[0].contentHtml, /<p>正文 <strong>内容<\/strong><\/p>/);
    assert.equal(parsed.items[0].imageUrl, 'https://example.com/images/cover.jpg');
    assert.deepEqual(parsed.items[0].imageUrls, [
      'https://example.com/images/cover.jpg',
      'https://cdn.example.com/detail.png',
    ]);

    const atom = parseRssFeed(`<?xml version="1.0"?>
      <feed xmlns="http://www.w3.org/2005/Atom">
        <title>Atom 测试</title>
        <link rel="alternate" href="https://example.com/atom" />
        <entry>
          <id>tag:example.com,2026:2</id>
          <title>Atom 内容</title>
          <link href="https://example.com/atom/2" />
          <updated>2026-08-30T03:00:00Z</updated>
          <summary type="html">&lt;p&gt;Atom 摘要&lt;/p&gt;</summary>
        </entry>
      </feed>`, 'https://example.com/atom.xml', 100);
    assert.equal(atom.items[0].title, 'Atom 内容');
    assert.equal(atom.items[0].contentText, 'Atom 摘要');

    let articleReaderConfig;
    const rssApp = createApp({
      serveFrontend: false,
      rssFetcher: async (url) => ({ ...parsed, feedUrl: url }),
      rssArticleFetcher: async (url, options) => {
        articleReaderConfig = options.readerConfig;
        return {
        title: '第一篇文章',
        byline: '测试作者',
        excerpt: '原文摘要',
        contentHtml: '<article><h2>原文标题</h2><p>完整正文</p></article>',
        contentText: '原文标题\n完整正文',
        url,
        fetchedAt: 101,
        };
      },
    });
    const response = await rssApp.request('/api/rss/fetch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://example.com/feed.xml' }),
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).items[0].title, '第一篇文章');

    const articleResponse = await rssApp.request('/api/rss/article', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://example.com/posts/1' }),
    });
    assert.equal(articleResponse.status, 200);
    assert.equal((await articleResponse.json()).contentText, '原文标题\n完整正文');
    assert.equal(articleReaderConfig.apiKey, 'test-search-key');
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

    protectedState.state.rssFeeds = [{
      id: 'rss-feed-1',
      title: '测试订阅',
      url: 'https://example.com/feed.xml',
      type: 'article',
      createdAt: 1,
      updatedAt: 1,
    }];
    protectedState.state.rssItems = [{
      id: 'rss-item-1',
      feedId: 'rss-feed-1',
      title: 'RSS 测试内容',
      link: 'https://example.com/posts/1',
      publishedAt: 100,
      fetchedAt: 100,
      contentText: 'RSS 正文',
    }, {
      id: 'rss-item-read',
      feedId: 'rss-feed-1',
      title: 'RSS 已读测试内容',
      link: 'https://example.com/posts/read',
      publishedAt: 150,
      fetchedAt: 150,
      contentText: '这篇文章已经读过，但仍应进入当天日报',
      readAt: 200,
    }];
    await aiApp.request('/api/state', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(protectedState),
    });
    const rssJobResponse = await aiApp.request('/api/ai/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        configId: 'provider-1',
        model: 'test-model',
        bookId: 'rss:rss-item-1',
        resourceType: 'rss',
        rssItemId: 'rss-item-1',
        purpose: 'summary',
        conversationId: 'rss-summary:rss-item-1',
        userMessage: {
          id: 'rss-user-message-1',
          content: '请总结当前内容',
          createdAt: 200,
        },
        session: { title: 'RSS 自动摘要', createdAt: 200 },
        currentText: '',
      }),
    });
    assert.equal(rssJobResponse.status, 202);
    const rssJob = await rssJobResponse.json();
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const response = await aiApp.request(`/api/ai/jobs/${rssJob.id}`);
      if ((await response.json()).status === 'completed') break;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    const rssStateResponse = await aiApp.request('/api/state');
    const rssState = await rssStateResponse.json();
    const summarizedRssItem = rssState.state.rssItems.find((item) => item.id === 'rss-item-1');
    assert.equal(summarizedRssItem.aiSummary, '服务端回答');
    assert.equal(summarizedRssItem.aiSummaryVersion, 2);

    const translationJobResponse = await aiApp.request('/api/ai/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        configId: 'provider-1',
        model: 'test-model',
        bookId: 'rss:rss-item-1',
        resourceType: 'rss',
        rssItemId: 'rss-item-1',
        purpose: 'translation',
        conversationId: 'rss-translation:rss-item-1',
        userMessage: {
          id: 'rss-translation-message-1',
          content: '请翻译当前内容',
          createdAt: 210,
        },
        session: { title: 'RSS 页面翻译', createdAt: 210 },
        currentText: '',
      }),
    });
    assert.equal(translationJobResponse.status, 202);
    const translationJob = await translationJobResponse.json();
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const response = await aiApp.request(`/api/ai/jobs/${translationJob.id}`);
      if ((await response.json()).status === 'completed') break;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    const translatedState = await (await aiApp.request('/api/state')).json();
    assert.equal(
      translatedState.state.rssItems.find((item) => item.id === 'rss-item-1').aiTranslation,
      '服务端回答',
    );

    translatedState.state.rssDigestSettings = {
      enabled: true,
      provider: 'api:provider-1',
      model: 'test-model',
      prompt: '整理测试日报',
      scheduleMode: 'every-4-hours',
      times: [],
    };
    translatedState.state.rssDigestRuns = [];
    translatedState.version = 21;
    await aiApp.request('/api/state', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(translatedState),
    });
    const digestResponse = await aiApp.request('/api/rss/digests/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: '1970-01-01', force: true }),
    });
    assert.equal(digestResponse.status, 202);
    const digestJob = (await digestResponse.json()).job;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const response = await aiApp.request(`/api/ai/jobs/${digestJob.id}`);
      if ((await response.json()).status === 'completed') break;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    const digestState = await (await aiApp.request('/api/state')).json();
    assert.equal(digestState.state.rssDailyDigests[0].date, '1970-01-01');
    assert.equal(digestState.state.rssDailyDigests[0].content, '服务端回答');
    assert.deepEqual(
      [...digestState.state.rssDailyDigests[0].sourceItemIds].sort(),
      ['rss-item-1', 'rss-item-read'],
    );
    assert.equal(digestState.state.rssDigestRuns[0].status, 'completed');
    assert.equal(digestState.state.rssDigestRuns[0].trigger, 'manual');
    assert.equal(digestState.state.rssDigestRuns[0].itemCount, 2);
    assert.equal(digestState.state.rssDigestRuns[0].model, 'test-model');

    const skippedDigestResponse = await aiApp.request('/api/rss/digests/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: '1970-01-01', force: false }),
    });
    assert.equal(skippedDigestResponse.status, 200);
    assert.equal((await skippedDigestResponse.json()).skipped, true);
    const skippedDigestState = await (await aiApp.request('/api/state')).json();
    assert.equal(skippedDigestState.state.rssDigestRuns[0].status, 'skipped');
    assert.equal(skippedDigestState.state.rssDigestRuns[0].message, '没有新的内容');

    const staleRssState = structuredClone(rssState);
    staleRssState.state.chatSessions = staleRssState.state.chatSessions
      .filter((session) => session.id !== 'rss-summary:rss-item-1');
    staleRssState.state.chats = staleRssState.state.chats
      .filter((message) => message.conversationId !== 'rss-summary:rss-item-1');
    const staleRssItem = staleRssState.state.rssItems.find((item) => item.id === 'rss-item-1');
    delete staleRssItem.aiSummary;
    delete staleRssItem.aiTranslation;
    delete staleRssState.state.rssDailyDigests;
    delete staleRssState.state.rssDigestRuns;
    await aiApp.request('/api/state', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(staleRssState),
    });
    const protectedRssState = await (await aiApp.request('/api/state')).json();
    const protectedRssItem = protectedRssState.state.rssItems.find((item) => item.id === 'rss-item-1');
    assert.equal(protectedRssItem.aiSummary, '服务端回答');
    assert.equal(protectedRssItem.aiSummaryVersion, 2);
    assert.equal(protectedRssItem.aiTranslation, '服务端回答');
    assert.equal(protectedRssState.state.rssDailyDigests[0].content, '服务端回答');
    assert.equal(protectedRssState.state.rssDigestRuns.length, 2);
    assert.ok(protectedRssState.state.rssDigestRuns.some((run) => run.status === 'completed'));
    assert.ok(protectedRssState.state.rssDigestRuns.some((run) => run.status === 'skipped'));
    assert.ok(protectedRssState.state.chatSessions.some((session) => session.id === 'rss-summary:rss-item-1'));
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
