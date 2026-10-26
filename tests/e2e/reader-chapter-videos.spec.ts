import { createServer, type Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import type { BookItem } from '../../contracts/books';
import type { ChapterVideo } from '../../contracts/reading';
import {
  videoFixturePhase,
  videoFixtureResponse,
} from '../../server/tests/fixtures/chapterVideoModel.mjs';

let modelServer: Server;
let baseUrl: string;
let requests = 0;
let invalid = false;
let modelGate: Promise<void> | undefined;
let releaseModel: (() => void) | undefined;

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
    const system = body.messages.find((message) => message.role === 'system')?.content ?? '';
    const content = videoFixtureResponse(videoFixturePhase(system), prompt, invalid);
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
test('手机视频面板按当前阅读章节预选，同名章节跳转后更新且不自动生成', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chrome');
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '我的书架' })).toBeVisible();
  const { token } = await (
    await page.request.post('/api/settings/openapi-token', {
      headers: { 'X-Learning-Center-Request': '1' },
    })
  ).json();
  const uploaded = await page.request.post('/api/openapi/v1/books?filename=video-scope.epub', {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/epub+zip' },
    data: await readFile(new URL('../fixtures/reader-regression.epub', import.meta.url)),
  });
  expect(uploaded.status()).toBe(201);
  const { book } = (await uploaded.json()) as { book: BookItem };
  book.toc[0].label = '同名章节';
  book.toc[1].label = '同名章节';
  const library = await (await page.request.get('/api/state/library')).json();
  library.state.books = library.state.books.map((item: BookItem) =>
    item.id === book.id ? { ...item, toc: book.toc, updatedAt: Date.now() } : item,
  );
  expect((await page.request.put('/api/state/library', { data: library })).status()).toBe(204);
  const requestsBeforeOpen = requests;
  await page.goto(`/books/${book.id}`);
  await expect(page.locator('foliate-view')).toBeVisible();
  await expect(page.getByText('正在打开 EPUB…', { exact: true })).toBeHidden();
  await openPanel(page, true);
  const panel = page.getByRole('complementary', { name: '章节视频', exact: true });
  const scope = panel.locator('#chapter-video-scope');
  await expect(scope).toContainText('同名章节');
  await scope.click();
  const choices = page.getByRole('option').filter({ hasText: '同名章节（含小节）' });
  await expect(choices.nth(0)).toHaveAttribute('aria-selected', 'true');
  await expect(choices.nth(1)).toHaveAttribute('aria-selected', 'false');
  await page.getByRole('option').filter({ hasText: '全书导读' }).click();
  await expect(scope).toContainText('全书导读');
  await page.goBack();
  await expect(panel).toBeHidden();
  await page.getByRole('button', { name: '打开书籍目录', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('navigation', { name: '书籍目录', exact: true })
    .locator('.toc-item')
    .filter({ hasText: '同名章节' })
    .nth(1)
    .click();
  for (const width of [375, 768]) {
    await page.setViewportSize({ width, height: 900 });
    await openPanel(page, true);
    await scope.click();
    await expect(choices.nth(1)).toHaveAttribute('aria-selected', 'true');
    await expect(choices.nth(0)).toHaveAttribute('aria-selected', 'false');
    await page.getByRole('option').filter({ hasText: '全书导读' }).click();
    await expect(scope).toContainText('全书导读');
    await page.goBack();
    await expect(panel).toBeHidden();
  }
  expect(requests).toBe(requestsBeforeOpen);
});

test('章节视频手动生成、实际播放、亮暗主题与四档宽度、章节切换和失败保留', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chrome');
  // Two complete frame renders also run on small, shared development servers.
  test.setTimeout(1_800_000);
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
  expect(
    (
      await page.request.put('/api/settings/tts', {
        data: {
          provider: 'aliyun',
          region: 'cn-beijing',
          model: 'qwen3-tts-flash',
          voice: 'Cherry',
          apiKey: 'fixture-tts-key',
        },
      })
    ).status(),
  ).toBe(200);
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
  const narration = panel.getByRole('checkbox', { name: '生成中文配音', exact: true });
  await expect(narration).toBeChecked();
  await narration.press('Space');
  await expect(narration).not.toBeChecked();
  await panel.getByRole('button', { name: '生成视频', exact: true }).click();
  const player = panel.locator('video');
  await expect(player).toBeVisible({ timeout: 600_000 });
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
  await panel.getByRole('button', { name: `播放 ${video.scenes[1].title}`, exact: true }).click();
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
      if (width <= 800) {
        await expect(panel.locator('#chapter-video-scope')).toContainText('本章小结');
        await panel.locator('#chapter-video-scope').click();
        await expect(
          page.getByRole('option').filter({ hasText: '本章小结（含小节）' }).first(),
        ).toHaveAttribute('aria-selected', 'true');
        await page.getByRole('option').filter({ hasText: '全书导读' }).click();
      }
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
      await expect(voice).toBeChecked();
      await expect(panel.getByRole('link', { name: '管理 TTS 配置', exact: true })).toBeVisible();
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
  await expect(narration).toBeChecked();
  await narration.press('Space');
  await expect(narration).not.toBeChecked();
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
  await expect(player).toBeVisible({ timeout: 600_000 });
  await expect(panel.getByLabel('已生成的视频')).toContainText('已生成（2）');
  const savedId = await player.getAttribute('src');
  invalid = true;
  await panel.getByRole('button', { name: '重新生成', exact: true }).click();
  await expect(page.getByText('重新生成章节视频？', { exact: true })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(panel.getByRole('alert')).toContainText('无法核验', { timeout: 30_000 });
  await expect(player).toHaveAttribute('src', savedId!);
  const requestsBeforeNavigation = requests;
  await page.goBack();
  await expect(panel).toBeHidden();
  await page.getByRole('button', { name: '打开书籍目录', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('navigation', { name: '书籍目录', exact: true })
    .locator('.toc-item')
    .filter({ hasText: '本章小结' })
    .nth(1)
    .click();
  await openPanel(page, true);
  await panel.locator('#chapter-video-scope').click();
  const currentChoices = page.getByRole('option').filter({ hasText: '本章小结（含小节）' });
  await expect(currentChoices.nth(1)).toHaveAttribute('aria-selected', 'true');
  await expect(currentChoices.nth(0)).toHaveAttribute('aria-selected', 'false');
  expect(requests).toBe(requestsBeforeNavigation);
});
