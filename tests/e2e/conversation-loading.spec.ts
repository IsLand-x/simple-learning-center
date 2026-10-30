import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { prepareWorkspace } from './workspace-fixtures';

for (const theme of ['light', 'dark'] as const) {
  test(`${theme}：对话摘要慢时正文可读，历史消息按会话分页加载`, async ({ page }, testInfo) => {
    test.setTimeout(60_000);
    await prepareWorkspace(page, { theme });
    await page.goto('about:blank');
    const bookId = 'demo-data-intensive';
    const sessionId = `lazy-${randomUUID()}`;
    const unrelatedId = `other-${randomUUID()}`;
    const snapshot = await (await page.request.get('/api/state/conversations')).json();
    snapshot.version = 38;
    snapshot.state.chatSessions = [
      { id: sessionId, bookId, title: '按需加载的历史对话', createdAt: 1, updatedAt: 100 },
      {
        id: unrelatedId,
        bookId: 'demo-thinking',
        title: '其他书籍的历史',
        createdAt: 1,
        updatedAt: 100,
      },
    ];
    snapshot.state.chats = [
      ...Array.from({ length: 70 }, (_, index) => ({
        id: `${sessionId}-${index}`,
        bookId,
        conversationId: sessionId,
        role: 'assistant',
        content: `分页历史消息${String(index).padStart(3, '0')}`,
        createdAt: index + 1,
        readAt: 100,
      })),
      {
        id: `${unrelatedId}-message`,
        bookId: 'demo-thinking',
        conversationId: unrelatedId,
        role: 'assistant',
        content: '其他书籍的大段正文'.repeat(10000),
        createdAt: 1,
      },
    ];
    expect((await page.request.put('/api/state/conversations', { data: snapshot })).status()).toBe(
      204,
    );
    const fullRequests: string[] = [];
    const messageRequests: string[] = [];
    page.on('request', (request) => {
      if (new URL(request.url()).pathname === '/api/state/conversations')
        fullRequests.push(request.method());
      if (/\/api\/conversations\/[^/]+\/messages$/.test(new URL(request.url()).pathname))
        messageRequests.push(request.url());
    });
    await page.route('**/api/state/conversations', (route) => route.abort());
    const gate = Promise.withResolvers<void>();
    let summaryRequested = false;
    await page.route('**/api/conversations?**', async (route) => {
      summaryRequested = true;
      await gate.promise;
      await route.fallback();
    });
    try {
      await page.goto(`/books/${bookId}`);
      await expect(page.locator('.reader-page')).toBeVisible({ timeout: 20_000 });
      await expect.poll(() => summaryRequested).toBe(true);
      expect(fullRequests).toEqual([]);
      expect(messageRequests).toEqual([]);
      await expect(page.locator('.reader-page')).toContainText('可靠');
      gate.resolve();
      const mobile = testInfo.project.name === 'mobile-chrome';
      if (mobile) await page.locator('.reader-toolbar--mobile button').last().click();
      await page.getByRole('button', { name: /对话历史/ }).click();
      await page.getByText('按需加载的历史对话', { exact: true }).click();
      await expect(page.getByText('分页历史消息069', { exact: true })).toBeVisible();
      await expect(page.getByText('分页历史消息000', { exact: true })).toHaveCount(0);
      await page.getByRole('button', { name: '加载更早消息', exact: true }).click();
      await expect(page.getByText('分页历史消息000', { exact: true })).toBeAttached();
      await expect(page.getByRole('button', { name: '加载更早消息', exact: true })).toHaveCount(0);
      expect(messageRequests.some((url) => url.includes(encodeURIComponent(sessionId)))).toBe(true);
      expect(
        messageRequests.every(
          (url) => new URL(url).searchParams.get('bookId') === bookId && !url.includes(unrelatedId),
        ),
      ).toBe(true);
      expect(fullRequests).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    } finally {
      gate.resolve();
    }
  });
}
