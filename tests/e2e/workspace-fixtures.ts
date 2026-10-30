import { expect, type Page } from '@playwright/test';

const fixtureTime = Date.parse('2026-09-26T04:00:00.000Z');
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
  if (domain === 'highlights' && Array.isArray(changes.highlights)) {
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
  {
    visualOnly = false,
    theme = 'light',
    fixedTime = true,
  }: { visualOnly?: boolean; theme?: string; fixedTime?: boolean } = {},
) {
  if (fixedTime) await page.clock.setFixedTime(new Date(fixtureTime));
  if (visualOnly) {
    // Visual tests use the container's fixed offline fonts, never a CDN-dependent font load.
    await page.route('https://cdn.jsdelivr.net/**', (route) => route.abort());
  } else {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: '我的书架' })).toBeVisible();
    // Unmount before direct API writes so the previous page cannot overwrite the next fixture.
    await page.goto('about:blank');
  }

  const snapshots = new Map<string, { state: Record<string, unknown>; version: number }>();
  const seed = async (domain: string, changes: Record<string, unknown>) => {
    if (!visualOnly) return patchStateDomain(page, domain, changes);
    // Never inherit another test's server values or browser defaults in a pixel fixture.
    snapshots.set(domain, { version: 35, state: structuredClone(changes) });
  };

  await seed('library', {
    books,
    bookLists: [],
    trashedBooks: [],
    deletedBookTombstones: [],
  });
  await seed('reading', { readingSessions: [] });
  await seed('notes', { notes: [], deletedNoteTombstones: [] });
  await seed('highlights', { highlights: [], deletedHighlightTombstones: [] });
  await seed('conversations', { chats: [], chatSessions: [] });
  await seed('preferences', {
    themeMode: theme,
    navCollapsed: false,
    openAIConfigs: [],
    aiPreferences: {
      provider: null,
      model: '',
      reasoningEffort: 'auto',
      autoHideReasoning: false,
      hiddenPromptTemplateIds: [],
    },
    webSearchConfig: { provider: 'jina', apiKey: '' },
    readerPreferences: {
      fontSize: 20,
      lineHeight: 1.8,
      theme: 'paper',
      fontFamily: 'source-serif',
      paragraphStyle: 'book',
      tocWidth: 272,
      panelWidth: 380,
      tocCollapsed: false,
    },
    readerPreferencesUpdatedAt: fixtureTime,
    readerStyleUpdatedAt: fixtureTime,
    readerLayoutUpdatedAt: fixtureTime,
  });

  if (visualOnly) {
    // Share status belongs to the same isolated visual fixture as the book metadata.
    await page.route(/\/api\/books\/[^/]+\/share(?:\?.*)?$/, (route) =>
      route.request().method() === 'GET'
        ? route.fulfill({ contentType: 'application/json', body: 'null' })
        : route.fallback(),
    );
    // Pixel assertions isolate state loading from previous E2E writes. Business tests use real APIs.
    await page.route(/\/api\/conversations(?:[/?].*)?$/, (route) =>
      route.fulfill({ json: { sessions: [], nextCursor: null } }),
    );
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
