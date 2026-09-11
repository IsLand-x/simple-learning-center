import { expect, test, type Page } from '@playwright/test';

async function selectTheme(page: Page, theme: 'light' | 'dark') {
  const currentTheme = await page.locator('body').getAttribute('theme-mode');
  if (currentTheme === theme) return;
  const targetLabel = theme === 'dark' ? '切换为深色主题' : '切换为浅色主题';
  await page.getByRole('button', { name: targetLabel }).click();
  await expect(page.locator('body')).toHaveAttribute('theme-mode', theme);
}

async function expectInsideViewport(page: Page, selector: string) {
  const bounds = await page.locator(selector).boundingBox();
  const viewport = page.viewportSize();
  expect(bounds).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport!.height);
}

test('all top-level routes load through their state-domain gates', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chrome');

  await page.goto('/');
  await expect(page.getByRole('heading', { name: '我的书架' })).toBeVisible();

  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: '设置' })).toBeVisible();

  await page.goto('/rss?source=all&range=all');
  await expect(page.getByRole('heading', { name: 'RSS', exact: true })).toBeVisible();

  await page.goto('/videos');
  await expect(page.getByRole('heading', { name: '视频学习' })).toBeVisible();
});

test('theme switching keeps the application on semantic dark mode', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chrome');

  await page.goto('/');
  await selectTheme(page, 'dark');
  await expect(page.locator('body')).toHaveAttribute('theme-mode', 'dark');
});

test('representative viewport and theme combinations keep the shell stable', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chrome');
  test.setTimeout(60_000);

  const viewports = [
    { width: 375, height: 812 },
    { width: 768, height: 1024 },
    { width: 1024, height: 768 },
    { width: 1440, height: 900 },
  ];

  for (const theme of ['light', 'dark'] as const) {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto('/');
    await selectTheme(page, theme);

    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await page.goto('/');
      await expect(page.locator('body')).toHaveAttribute('theme-mode', theme);
      await expect(page.getByRole('heading', { name: '我的书架' })).toBeVisible();

      const dimensions = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }));
      expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);

      if (viewport.width <= 800) {
        await expect(page.locator('.mobile-main-nav')).toBeVisible();
        await expectInsideViewport(page, '.mobile-main-nav');
        await expect(page.locator('.main-nav')).toBeHidden();
      } else {
        await expect(page.locator('.main-nav')).toBeVisible();
        await expect(page.locator('.mobile-main-nav')).toBeHidden();
      }
    }
  }
});

test('mobile library uses the bottom navigation without horizontal overflow', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chrome');

  await page.goto('/');
  await expect(page.getByRole('heading', { name: '我的书架' })).toBeVisible();
  await expect(page.locator('.mobile-main-nav')).toBeVisible();
  await expectInsideViewport(page, '.mobile-main-nav');
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
});

test('reader AI user messages preserve authored line breaks', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chrome');

  await page.goto('/');
  await expect(page.getByRole('heading', { name: '我的书架' })).toBeVisible();
  await expect
    .poll(async () => {
      const response = await page.request.get('/api/state/library');
      return response.status();
    })
    .toBe(200);

  const conversationsResponse = await page.request.get('/api/state/conversations');
  expect(conversationsResponse.ok()).toBe(true);
  const conversations = await conversationsResponse.json();
  const createdAt = Date.now();
  const conversationId = 'e2e-reader-line-breaks';
  conversations.state.chatSessions = [
    ...(conversations.state.chatSessions ?? []).filter(
      (session: { id?: string }) => session.id !== conversationId,
    ),
    {
      id: conversationId,
      bookId: 'demo-data-intensive',
      title: '分段消息显示验证',
      createdAt,
      updatedAt: createdAt,
    },
  ];
  conversations.state.chats = [
    ...(conversations.state.chats ?? []).filter(
      (message: { conversationId?: string }) => message.conversationId !== conversationId,
    ),
    {
      id: 'e2e-reader-line-breaks-message',
      bookId: 'demo-data-intensive',
      conversationId,
      role: 'user',
      content: '第一段描述\n第二段描述',
      createdAt,
    },
  ];
  const writeResponse = await page.request.put('/api/state/conversations', {
    data: conversations,
  });
  expect(writeResponse.status()).toBe(204);

  await page.goto('/books/demo-data-intensive');
  await page.getByRole('button', { name: '打开对话历史' }).click();
  await page.getByRole('button', { name: /分段消息显示验证/ }).click();

  const userParagraph = page.locator('.ai-message--user p').filter({ hasText: '第一段描述' });
  await expect(userParagraph).toContainText('第二段描述');
  const lineMetrics = await userParagraph.evaluate((element) => {
    const style = window.getComputedStyle(element);
    return {
      height: element.getBoundingClientRect().height,
      lineHeight: Number.parseFloat(style.lineHeight),
      whiteSpace: style.whiteSpace,
    };
  });
  expect(lineMetrics.whiteSpace).toBe('pre-wrap');
  expect(lineMetrics.height).toBeGreaterThan(lineMetrics.lineHeight * 1.5);
});
