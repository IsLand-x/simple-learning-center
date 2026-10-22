import { createServer, type Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import type { View } from 'foliate-js/view.js';
import type { ChapterMindMap } from '../../contracts/reading';

let modelServer: Server;
let baseUrl: string;
let invalidResponse = false;
let requests = 0;

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
    const prompt = body.messages.findLast((message) => message.role === 'user')!.content;
    const entries = JSON.parse(prompt.slice(prompt.indexOf('['))) as Array<{
      passageId?: string;
      text?: string;
      sources?: Array<{ passageId: string; quote: string }>;
    }>;
    const entry = entries.at(-1)!;
    const sources = entry.sources ?? [
      { passageId: entry.passageId!, quote: entry.text!.trim().slice(0, 100) },
      { passageId: entry.passageId!, quote: entry.text!.trim().slice(-100) },
    ];
    const content = JSON.stringify({
      nodes: [
        {
          key: 'main',
          parent: null,
          title: '通过回顾与原文核对建立理解',
          sources: sources.map((source) => ({
            ...source,
            ...(invalidResponse ? { quote: '这是一段没有出现在测试书中的虚构内容。' } : {}),
          })),
        },
      ],
    });
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    response.end(
      `data: ${JSON.stringify({ id: 'mindmap-test', choices: [{ index: 0, delta: { role: 'assistant', content }, finish_reason: null }] })}\n\ndata: ${JSON.stringify({ id: 'mindmap-test', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`,
    );
  });
  await new Promise<void>((resolve) => modelServer.listen(0, '127.0.0.1', resolve));
  const address = modelServer.address();
  if (!address || typeof address === 'string') throw new Error('测试模型无法启动');
  baseUrl = `http://127.0.0.1:${address.port}/v1`;
});
test.afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    modelServer.close((error) => (error ? reject(error) : resolve())),
  );
});

async function openPanel(page: Page, mobile: boolean) {
  if (mobile) {
    await page.getByRole('button', { name: '打开更多功能，默认显示 AI 助手' }).click();
    await page
      .getByRole('navigation', { name: '切换更多功能' })
      .getByRole('button', { name: '打开思维导图', exact: true })
      .click();
  } else await page.getByRole('button', { name: '打开思维导图', exact: true }).click();
}

test.use({ reducedMotion: 'reduce', serviceWorkers: 'block' });
for (const theme of ['light', 'dark']) {
  for (const width of [375, 768, 1024, 1440]) {
    test(`章节导图生成、恢复和精准跳转 ${theme} ${width}`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'desktop-chrome');
      test.setTimeout(90_000);
      invalidResponse = false;
      await page.setViewportSize({ width, height: width < 800 ? 900 : 960 });
      const mobile = width <= 800;
      await page.goto('/');
      await expect(page.getByRole('heading', { name: '我的书架' })).toBeVisible();
      await page.goto('about:blank');
      const preferences = await (await page.request.get('/api/state/preferences')).json();
      preferences.state = {
        ...preferences.state,
        themeMode: theme,
        openAIConfigs: [
          {
            id: 'mindmap-fixture',
            name: '本地测试模型',
            baseUrl,
            apiKey: 'fixture-key',
            models: ['mindmap-test'],
            createdAt: 1,
            updatedAt: 1,
          },
        ],
        aiPreferences: {
          ...preferences.state.aiPreferences,
          provider: 'api:mindmap-fixture',
          model: 'mindmap-test',
        },
        readerPreferences: {
          ...preferences.state.readerPreferences,
          fontSize: 18,
          tocCollapsed: true,
          panelWidth: 480,
        },
        readerPreferencesUpdatedAt: Date.now(),
        readerStyleUpdatedAt: Date.now(),
        readerLayoutUpdatedAt: Date.now(),
      };
      expect(
        (await page.request.put('/api/state/preferences', { data: preferences })).status(),
      ).toBe(204);
      const { token } = await (
        await page.request.post('/api/settings/openapi-token', {
          headers: { 'X-Learning-Center-Request': '1' },
        })
      ).json();
      const uploaded = await page.request.post('/api/openapi/v1/books?filename=mindmap.epub', {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/epub+zip' },
        data: await readFile(new URL('../fixtures/reader-regression.epub', import.meta.url)),
      });
      expect(uploaded.status()).toBe(201);
      const { book } = await uploaded.json();
      await page.goto(`/books/${book.id}`);
      await expect(page.getByText('正在打开 EPUB…', { exact: true })).toBeHidden();
      await expect(page.locator('foliate-view')).toBeVisible({ timeout: 30_000 });
      await openPanel(page, mobile);
      const panel = page.getByRole('complementary', { name: '思维导图', exact: true });
      await expect(panel.getByRole('button', { name: '生成思维导图', exact: true })).toBeEnabled({
        timeout: 30_000,
      });
      const before = requests;
      await panel.getByRole('button', { name: '生成思维导图', exact: true }).click();
      const node = panel.getByRole('button', { name: '通过回顾与原文核对建立理解', exact: true });
      await expect(node).toBeVisible({ timeout: 30_000 });
      expect(requests).toBeGreaterThan(before);
      await expect(page.locator('body')).toHaveAttribute('theme-mode', theme);
      await panel.getByRole('button', { name: /^收起“.*”的子节点$/ }).click();
      await expect(node).toHaveCount(0);
      await panel.getByRole('button', { name: /^展开“.*”的子节点$/ }).click();
      await expect(node).toBeVisible();
      await panel.getByRole('button', { name: '放大导图' }).click();
      await panel.getByRole('button', { name: '导图适应面板' }).click();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      );
      expect(overflow).toBe(false);
      await page.screenshot({ path: testInfo.outputPath(`mindmap-${theme}-${width}.png`) });
      const highlights = await (await page.request.get('/api/state/highlights')).json();
      const reading = await (await page.request.get('/api/state/reading')).json();
      const saved = (reading.state.chapterMindMaps as ChapterMindMap[]).find(
        (map) => map.bookId === book.id,
      )!;
      expect(saved.nodes[1].sources[0].cfi).toMatch(/^epubcfi\(/);
      await node.click();
      if (mobile) await expect(panel).toBeHidden();
      else await expect(panel.getByRole('alert')).toHaveCount(0);
      const quote = saved.nodes[1].sources[0].quote.replace(/\s/g, '').slice(0, 20);
      await expect
        .poll(() =>
          page.locator('foliate-view').evaluate((element, needle) => {
            const view = element as View;
            return (
              view.lastLocation?.range?.toString().replace(/\s/g, '').includes(needle) ?? false
            );
          }, quote),
        )
        .toBe(true);
      const afterHighlights = await (await page.request.get('/api/state/highlights')).json();
      expect(afterHighlights.state.highlights).toEqual(highlights.state.highlights);

      if (mobile) {
        await openPanel(page, mobile);
        await expect(panel.getByRole('button', { name: '查看原文 2', exact: true })).toBeVisible();
        await panel.getByRole('button', { name: '查看原文 2', exact: true }).click();
        await expect(panel).toBeHidden();
      }
      const completedRequests = requests;
      const changedStyle = await (await page.request.get('/api/state/preferences')).json();
      changedStyle.state.readerPreferences = {
        ...changedStyle.state.readerPreferences,
        fontSize: 22,
        panelWidth: 400,
      };
      changedStyle.state.readerStyleUpdatedAt = Date.now() + 1;
      changedStyle.state.readerLayoutUpdatedAt = Date.now() + 1;
      await page.request.put('/api/state/preferences', { data: changedStyle });
      await page.reload();
      await expect(page.locator('foliate-view')).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText('正在打开 EPUB…', { exact: true })).toBeHidden();
      await openPanel(page, mobile);
      await expect(
        panel.getByRole('button', { name: '通过回顾与原文核对建立理解', exact: true }),
      ).toBeVisible();
      expect(requests).toBe(completedRequests);
      await panel
        .getByRole('button', { name: '通过回顾与原文核对建立理解', exact: true })
        .press('Enter');
      await expect
        .poll(() =>
          page
            .locator('foliate-view')
            .evaluate(
              (element, needle) =>
                (element as View).lastLocation?.range
                  ?.toString()
                  .replace(/\s/g, '')
                  .includes(needle) ?? false,
              quote,
            ),
        )
        .toBe(true);
      if (width === 1440 && theme === 'light') {
        invalidResponse = true;
        await panel.getByRole('button', { name: '重新生成', exact: true }).click();
        await expect(page.getByText('重新生成章节思维导图？', { exact: true })).toBeVisible();
        await page.keyboard.press('Enter');
        await expect(panel.getByRole('alert')).toContainText('无法核验', { timeout: 30_000 });
        await expect(
          panel.getByRole('button', { name: '通过回顾与原文核对建立理解', exact: true }),
        ).toBeVisible();
      }
    });
  }
}
