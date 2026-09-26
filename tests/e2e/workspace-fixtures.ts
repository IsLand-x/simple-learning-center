import { expect, type Page } from '@playwright/test';

const fixtureTime = Date.parse('2026-09-26T04:00:00.000Z');
export const fixtureArticleTitle = '把阅读记录整理成可检索的知识';
export const fixtureVideo = {
  id: 'e2e-learning-video',
  youtubeVideoId: 'e2eVideo001',
  url: 'https://www.youtube.com/watch?v=e2eVideo001',
  title: '如何通过主动回忆理解一本书',
  channelTitle: '学习方法示例频道',
  description: '此视频资料与字幕仅供自动化测试，不会请求真实视频服务。',
  durationSeconds: 180,
  captions: {
    originalLanguage: 'en',
    originalLanguageLabel: 'English',
    original: [
      { startSeconds: 0, durationSeconds: 30, text: 'Start with a question before reading.' },
      { startSeconds: 30, durationSeconds: 40, text: 'Explain the idea using your own words.' },
      { startSeconds: 70, durationSeconds: 40, text: 'Return to the book and check your answer.' },
    ],
    chinese: [
      { startSeconds: 0, durationSeconds: 30, text: '阅读前，先提出一个问题。' },
      { startSeconds: 30, durationSeconds: 40, text: '用自己的语言解释这个概念。' },
      { startSeconds: 70, durationSeconds: 40, text: '回到书中，检查自己的答案。' },
    ],
  },
  createdAt: fixtureTime,
  updatedAt: fixtureTime,
};

const books = [
  {
    id: 'demo-data-intensive',
    kind: 'demo',
    title: 'Designing Data-Intensive Applications',
    author: 'Martin Kleppmann',
    fileName: 'designing-data-intensive-applications.epub',
    fileSize: 8_740_000,
    progress: 0,
    currentChapter: '第一章 · 可靠、可扩展与可维护',
    currentPage: 1,
    totalPages: 446,
    toc: [
      { id: 'd1', href: 'chapter-1', label: '第一章 · 可靠、可扩展与可维护' },
      { id: 'd2', href: 'chapter-2', label: '第二章 · 数据模型与查询语言' },
      { id: 'd3', href: 'chapter-3', label: '第三章 · 存储与检索' },
    ],
  },
  {
    id: 'demo-thinking',
    kind: 'demo',
    title: '思考，快与慢',
    author: 'Daniel Kahneman',
    fileName: 'thinking-fast-and-slow.epub',
    fileSize: 4_680_000,
    progress: 18,
    currentChapter: '启发法与偏见',
    currentPage: 92,
    totalPages: 512,
    toc: [{ id: 't1', href: 'chapter-1', label: '第一部分 · 系统 1，系统 2' }],
  },
  {
    id: 'demo-learning',
    kind: 'demo',
    title: '学习之道',
    author: 'Josh Waitzkin',
    fileName: 'the-art-of-learning.epub',
    fileSize: 3_120_000,
    progress: 67,
    currentChapter: '化小圈为大圈',
    currentPage: 176,
    totalPages: 263,
    toc: [{ id: 'l1', href: 'chapter-1', label: '第一章 · 天真无邪的探索' }],
  },
].map((book, index) => ({
  ...book,
  createdAt: fixtureTime - (index + 1) * 86_400_000,
  updatedAt: fixtureTime - (index + 1) * 3_600_000,
}));

async function patchStateDomain(page: Page, domain: string, changes: Record<string, unknown>) {
  const response = await page.request.get(`/api/state/${domain}`);
  expect(response.ok()).toBe(true);
  const snapshot = await response.json();
  if (domain === 'reading' && Array.isArray(changes.highlights)) {
    // Existing highlights deliberately survive stale snapshots; reset them through tombstones.
    changes = {
      ...changes,
      deletedHighlightTombstones: (snapshot.state.highlights ?? []).map(
        (highlight: { id: string; bookId: string; updatedAt?: number; createdAt: number }) => ({
          highlightId: highlight.id,
          bookId: highlight.bookId,
          deletedAt: Math.max(Date.now(), highlight.updatedAt ?? highlight.createdAt) + 1,
        }),
      ),
    };
  }
  if (domain === 'preferences' && changes.readerPreferences) {
    const timestamp =
      Math.max(
        Date.now(),
        snapshot.state.readerStyleUpdatedAt ?? 0,
        snapshot.state.readerLayoutUpdatedAt ?? 0,
      ) + 1;
    changes = {
      ...changes,
      readerPreferencesUpdatedAt: timestamp,
      readerStyleUpdatedAt: timestamp,
      readerLayoutUpdatedAt: timestamp,
    };
  }
  snapshot.state = { ...snapshot.state, ...changes };
  const saved = await page.request.put(`/api/state/${domain}`, { data: snapshot });
  expect(saved.status()).toBe(204);
}

export async function prepareWorkspace(
  page: Page,
  { visualOnly = false, theme = 'light' }: { visualOnly?: boolean; theme?: string } = {},
) {
  await page.clock.setFixedTime(new Date(fixtureTime));
  // The player remains a real iframe; its third-party content is replaced with a static fixture.
  await page.route('https://www.youtube-nocookie.com/embed/**', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><html lang="zh-CN"><body style="margin:0;background:#111"></body></html>',
    }),
  );
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '我的书架' })).toBeVisible();
  // Unmount before direct API writes so the previous page cannot overwrite the next fixture.
  await page.goto('about:blank');

  const snapshots = new Map<string, { state: Record<string, unknown>; version: number }>();
  const seed = async (domain: string, changes: Record<string, unknown>) => {
    if (!visualOnly) return patchStateDomain(page, domain, changes);
    const response = await page.request.get(`/api/state/${domain}`);
    expect(response.ok()).toBe(true);
    const snapshot = await response.json();
    snapshots.set(domain, { ...snapshot, state: { ...snapshot.state, ...changes } });
  };

  await seed('library', {
    books,
    bookLists: [],
    trashedBooks: [],
    deletedBookTombstones: [],
  });
  await seed('reading', {
    highlights: [],
    notes: [],
    readingSessions: [],
    deletedHighlightTombstones: [],
  });
  await seed('conversations', { chats: [], chatSessions: [] });
  await seed('preferences', {
    themeMode: theme,
    navCollapsed: false,
    openAIConfigs: [],
    readerPreferences: {
      fontSize: 18,
      lineHeight: 2,
      theme: 'paper',
      fontFamily: 'kai',
      tocWidth: 272,
      panelWidth: 380,
      tocCollapsed: false,
    },
    readerPreferencesUpdatedAt: fixtureTime,
    readerStyleUpdatedAt: fixtureTime,
    readerLayoutUpdatedAt: fixtureTime,
  });
  // Remove the fixture feed before recreating it; server merges otherwise retain its read state.
  if (!visualOnly) await seed('rss', { rssFeeds: [], rssItems: [] });
  await seed('rss', {
    rssFolders: [],
    rssFeeds: [
      {
        id: 'e2e-reading-feed',
        title: '阅读与思考',
        url: 'https://example.invalid/reading.xml',
        source: { kind: 'rss', feedUrl: 'https://example.invalid/reading.xml' },
        type: 'article',
        fetchFullContent: false,
        createdAt: fixtureTime,
        updatedAt: fixtureTime,
        lastFetchedAt: fixtureTime,
      },
    ],
    rssItems: [
      {
        id: 'e2e-reading-article',
        feedId: 'e2e-reading-feed',
        title: fixtureArticleTitle,
        link: 'https://example.invalid/reading-notes',
        author: '示例作者',
        publishedAt: fixtureTime - 3_600_000,
        fetchedAt: fixtureTime,
        contentText:
          '阅读时先提出问题，再用自己的语言记录理解。定期回顾笔记，可以发现不同主题之间的联系。',
        contentHtml:
          '<h2>从问题开始</h2><p>阅读时先提出问题，再用自己的语言记录理解。</p><h2>建立可回顾的记录</h2><p>定期回顾笔记，可以发现不同主题之间的联系。</p>',
      },
      {
        id: 'e2e-review-article',
        feedId: 'e2e-reading-feed',
        title: '给笔记安排一次定期回顾',
        link: 'https://example.invalid/review-notes',
        author: '示例作者',
        publishedAt: fixtureTime - 7_200_000,
        fetchedAt: fixtureTime,
        contentText: '将自己的解释和原文对照，修正遗漏的条件。',
        contentHtml: '<p>将自己的解释和原文对照，修正遗漏的条件。</p>',
      },
    ],
    rssAnnotations: [],
    rssDailyDigests: [],
    rssDigestRuns: [],
    rssPanelWidth: 380,
    rssDigestSettings: { enabled: false },
  });
  await seed('videos', {
    videoResources: [fixtureVideo],
    videoTimestampNotes: [],
    videoPanelWidth: 400,
  });

  if (visualOnly) {
    // Pixel assertions isolate state loading from previous E2E writes. Business tests use real APIs.
    await page.route(/\/api\/state(?:\/[^?]+)?(?:\?.*)?$/, async (route) => {
      const request = route.request();
      if (request.method() !== 'GET') return route.fulfill({ status: 204 });
      const domain = new URL(request.url()).pathname.split('/')[3];
      const snapshot = domain
        ? snapshots.get(domain)
        : {
            version: snapshots.get('library')!.version,
            state: Object.assign({}, ...[...snapshots.values()].map((item) => item.state)),
          };
      await route.fulfill({ json: snapshot });
    });
  }
}
