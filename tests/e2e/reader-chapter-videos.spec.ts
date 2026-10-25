import { createServer, type Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import type { BookItem } from '../../contracts/books';
import type { ChapterVideo } from '../../contracts/reading';

let modelServer: Server;
let baseUrl: string;
let requests = 0;
let invalid = false;
let modelGate: Promise<void> | undefined;
let releaseModel: (() => void) | undefined;
const quotes = new Map<string, string>();

test.beforeAll(async () => {
  modelServer = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString()) as {
      messages: Array<{ role: string; content: string }>;
      tools?: unknown[];
    };
    expect(body.tools ?? []).toHaveLength(0);
    requests++;
    if (modelGate) await modelGate;
    const prompt = body.messages.filter((message) => message.role === 'user').at(-1)!.content;
    const entries = JSON.parse(prompt.slice(prompt.indexOf('['))) as Array<{
      passageId?: string;
      text?: string;
      sources?: Array<{ passageId: string; quote: string }>;
    }>;
    for (const entry of entries) {
      if (entry.passageId && entry.text) quotes.set(entry.passageId, entry.text.slice(0, 80));
      for (const source of entry.sources ?? []) quotes.set(source.passageId, source.quote);
    }
    const id = entries[0].passageId ?? entries[0].sources![0].passageId;
    const source = {
      passageId: id,
      quote: invalid ? '这是一段没有出现在书籍中的虚构原文引用。' : quotes.get(id)!,
    };
    const isStoryboard = body.messages.some(
      (message) => message.role === 'system' && message.content.includes('分镜'),
    );
    const content = JSON.stringify(
      isStoryboard
        ? {
            title: '用问题、证据与回顾理解阅读',
            summary: '用三个知识点建立自己的阅读理解',
            scenes: ['从一个阅读问题开始', '用原文证据连接观点', '回顾知识并试着复述'].map(
              (title, index) => ({
                title,
                narration:
                  '阅读时可以先提出一个明确的问题，再用书中的证据理解作者的观点，最后用自己的话回顾所学知识。',
                layout: ['concept', 'steps', 'summary'][index],
                points: [
                  { title: '明确问题', detail: '先确认这一节要解决什么问题' },
                  { title: '核对证据', detail: '让理解能够回到原文中验证' },
                  { title: '主动回顾', detail: '尝试用自己的话解释知识点' },
                ],
                sources: [source],
              }),
            ),
          }
        : {
            nodes: [
              { key: 'learning', parent: null, title: '用问题和证据建立理解', sources: [source] },
            ],
          },
    );
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    response.end(
      `data: ${JSON.stringify({ id: 'video-test', choices: [{ index: 0, delta: { role: 'assistant', content }, finish_reason: null }] })}\n\ndata: ${JSON.stringify({ id: 'video-test', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`,
    );
  });
  await new Promise<void>((resolve) => modelServer.listen(0, '127.0.0.1', resolve));
  const address = modelServer.address();
  if (!address || typeof address === 'string') throw new Error('测试模型无法启动');
  baseUrl = `http://127.0.0.1:${address.port}/v1`;
});
test.afterAll(async () => {
  modelGate = undefined;
  releaseModel?.();
  await new Promise<void>((resolve) => modelServer.close(() => resolve()));
});

async function openPanel(page: Page, mobile: boolean) {
  if (mobile) {
    await page.getByRole('button', { name: '打开更多功能，默认显示 AI 助手' }).click();
    await page
      .getByRole('navigation', { name: '切换更多功能' })
      .getByRole('button', { name: '打开章节视频', exact: true })
      .click();
  } else await page.getByRole('button', { name: '打开章节视频', exact: true }).click();
}

test.use({ reducedMotion: 'reduce', serviceWorkers: 'block' });
test('章节视频手动生成、实际播放、亮暗主题与四档宽度、章节切换和失败保留', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chrome');
  test.setTimeout(240_000);
  page.setDefaultTimeout(10_000);
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '我的书架' })).toBeVisible();
  await page.goto('about:blank');
  const preferences = await (await page.request.get('/api/state/preferences')).json();
  preferences.state = {
    ...preferences.state,
    themeMode: 'light',
    openAIConfigs: [
      {
        id: 'video-fixture',
        name: '本地测试模型',
        baseUrl,
        apiKey: 'fixture-key',
        models: ['video-test'],
        createdAt: 1,
        updatedAt: 1,
      },
    ],
    aiPreferences: {
      ...preferences.state.aiPreferences,
      provider: 'api:video-fixture',
      model: 'video-test',
    },
    readerPreferences: {
      ...preferences.state.readerPreferences,
      tocCollapsed: true,
      panelWidth: 480,
    },
    readerPreferencesUpdatedAt: Date.now(),
    readerStyleUpdatedAt: Date.now(),
    readerLayoutUpdatedAt: Date.now(),
  };
  expect((await page.request.put('/api/state/preferences', { data: preferences })).status()).toBe(
    204,
  );
  const { token } = await (
    await page.request.post('/api/settings/openapi-token', {
      headers: { 'X-Learning-Center-Request': '1' },
    })
  ).json();
  const uploaded = await page.request.post('/api/openapi/v1/books?filename=chapter-video.epub', {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/epub+zip' },
    data: await readFile(new URL('../fixtures/reader-regression.epub', import.meta.url)),
  });
  expect(uploaded.status()).toBe(201);
  const { book } = (await uploaded.json()) as { book: BookItem };
  // Some EPUBs repeat both chapter titles and publisher-supplied IDs.
  // Preserve real navigation targets while exercising repeated titles here.
  expect(book.toc.length).toBeGreaterThanOrEqual(2);
  book.toc[0].label = '本章小结';
  book.toc[1].label = '本章小结';
  const library = await (await page.request.get('/api/state/library')).json();
  library.state.books = library.state.books.map((entry: BookItem) =>
    entry.id === book.id
      ? {
          ...entry,
          toc: book.toc,
          updatedAt: Date.now(),
        }
      : entry,
  );
  expect((await page.request.put('/api/state/library', { data: library })).status()).toBe(204);
  await page.goto(`/books/${book.id}`);
  await expect(page.locator('foliate-view')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('正在打开 EPUB…', { exact: true })).toBeHidden();
  await openPanel(page, false);
  const panel = page.getByRole('complementary', { name: '章节视频', exact: true });
  await expect(panel.getByText('还没有全书导读视频', { exact: true })).toBeVisible();
  expect(requests).toBe(0);
  await panel.getByRole('button', { name: '生成视频', exact: true }).click();
  const player = panel.locator('video');
  await expect(player).toBeVisible({ timeout: 90_000 });
  await expect
    .poll(() => player.evaluate((element: HTMLVideoElement) => element.readyState))
    .toBeGreaterThanOrEqual(1);
  const reading = await (await page.request.get('/api/state/reading')).json();
  const video = (reading.state.chapterVideos as ChapterVideo[]).find(
    (item) => item.bookId === book.id,
  )!;
  expect(video.chapterId).toBeUndefined();
  expect(video.scenes).toHaveLength(3);
  expect(
    Math.abs(
      (await player.evaluate((element: HTMLVideoElement) => element.duration)) -
        video.durationSeconds,
    ),
  ).toBeLessThan(0.1);
  await panel.getByRole('button', { name: '播放 用原文证据连接观点', exact: true }).click();
  await expect
    .poll(() => player.evaluate((element: HTMLVideoElement) => element.currentTime))
    .toBeGreaterThanOrEqual(video.scenes[1].startSeconds - 0.2);
  await player.evaluate((element: HTMLVideoElement) => element.pause());
  await panel.getByRole('button', { name: '全屏播放', exact: true }).click();
  await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
  await page.evaluate(() => document.exitFullscreen());
  await player.evaluate((element: HTMLVideoElement) => element.pause());
  const completedRequests = requests;

  for (const theme of ['light', 'dark'])
    for (const width of [1440, 1024, 768, 375]) {
      await page.goto('about:blank');
      const next = await (await page.request.get('/api/state/preferences')).json();
      next.state.themeMode = theme;
      await page.request.put('/api/state/preferences', { data: next });
      await page.setViewportSize({ width, height: width <= 800 ? 900 : 960 });
      await page.goto(`/books/${book.id}`);
      await expect(page.locator('foliate-view')).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText('正在打开 EPUB…', { exact: true })).toBeHidden();
      await openPanel(page, width <= 800);
      await expect(player).toBeVisible();
      await expect
        .poll(() => player.evaluate((element: HTMLVideoElement) => element.readyState))
        .toBeGreaterThanOrEqual(1);
      await expect(page.locator('body')).toHaveAttribute('theme-mode', theme);
      expect(requests).toBe(completedRequests);
      await expect(panel.getByRole('button', { name: '全屏播放', exact: true })).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
      ).toBe(false);
      const overflow = await panel.evaluate((element) => element.scrollWidth > element.clientWidth);
      expect(overflow).toBe(false);
      await page.screenshot({ path: testInfo.outputPath(`chapter-video-${theme}-${width}.png`) });
      await panel.locator('#chapter-video-scope').click();
      await page.getByRole('option').filter({ hasText: '全书导读' }).click({ timeout: 5000 });
      await panel.locator('#chapter-video-scope').click();
      const summaries = page.getByRole('option').filter({ hasText: '本章小结（含小节）' });
      await expect(summaries).toHaveCount(2);
      await summaries.nth(1).click();
      await panel.locator('#chapter-video-scope').click();
      await expect(summaries.nth(1)).toHaveAttribute('aria-selected', 'true');
      await expect(summaries.nth(0)).toHaveAttribute('aria-selected', 'false');
      await page.getByRole('option').filter({ hasText: '全书导读' }).click();
      if (width <= 800) {
        expect(
          await panel.locator('#chapter-video-scope').evaluate((element) => {
            element.scrollTop = 12;
            return {
              scrollTop: element.scrollTop,
              overflowY: getComputedStyle(element).overflowY,
              maxHeight: getComputedStyle(element).maxHeight,
            };
          }),
        ).toEqual({ scrollTop: 0, overflowY: 'visible', maxHeight: 'none' });
      }
      const voice = panel.getByRole('checkbox', { name: '生成中文配音', exact: true });
      await panel.getByText('生成中文配音', { exact: true }).click();
      await expect(voice).toBeChecked();
      await expect(panel.getByRole('textbox', { name: '语音模型', exact: true })).toBeVisible();
      expect(await panel.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(
        false,
      );
      await voice.press('Space');
      await expect(voice).not.toBeChecked();
      if (width <= 800) {
        await page.goBack();
        await expect(panel).toBeHidden();
        await expect(page).toHaveURL(new RegExp(`/books/${book.id}$`));
      }
    }
  await page.goto('about:blank');
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto(`/books/${book.id}`);
  await expect(page.getByText('正在打开 EPUB…', { exact: true })).toBeHidden();
  await openPanel(page, true);
  await panel.locator('#chapter-video-scope').click();
  await page
    .getByRole('option')
    .filter({ hasText: `${book.toc[0].label}（含小节）` })
    .first()
    .click({ timeout: 5000 });
  modelGate = new Promise<void>((resolve) => {
    releaseModel = resolve;
  });
  await panel.getByRole('button', { name: '生成视频', exact: true }).click();
  const tasks = panel.getByRole('region', { name: '视频生成任务', exact: true });
  await expect(tasks).toContainText('正在提炼知识点', { timeout: 30_000 });
  const progress = await (
    await page.request.get(`/api/ai/jobs/chapter-videos?bookId=${book.id}`)
  ).json();
  const running = progress.jobs.find((job: { status: string }) => job.status === 'running');
  expect(running.chapterId).toBe(book.toc[0].id);
  await page.goBack();
  await expect(panel).toBeHidden();
  await openPanel(page, true);
  await expect(tasks).toContainText('正在提炼知识点');
  await expect(panel.locator('#chapter-video-scope')).toContainText('本章小结');
  await page.reload();
  await expect(page.getByText('正在打开 EPUB…', { exact: true })).toBeHidden();
  await openPanel(page, true);
  await expect(tasks).toContainText('正在提炼知识点');
  await expect(panel.locator('#chapter-video-scope')).toContainText('本章小结');
  expect(requests).toBe(completedRequests + 1);
  modelGate = undefined;
  releaseModel?.();
  await expect(player).toBeVisible({ timeout: 90_000 });
  await expect(panel.getByLabel('已生成的视频')).toContainText('已生成（2）');
  const savedId = await player.getAttribute('src');
  invalid = true;
  await panel.getByRole('button', { name: '重新生成', exact: true }).click();
  await expect(page.getByText('重新生成章节视频？', { exact: true })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(panel.getByRole('alert')).toContainText('无法核验', { timeout: 30_000 });
  await expect(player).toHaveAttribute('src', savedId!);
});
