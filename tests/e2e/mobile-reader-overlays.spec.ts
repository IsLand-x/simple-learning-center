import { expect, test, type CDPSession, type Locator } from '@playwright/test';
import { demoBooks } from '../../src/data/demo';

async function swipe(session: CDPSession, target: Locator, direction: 'left' | 'right') {
  await expect(target).toBeVisible();
  const bounds = (await target.boundingBox())!;
  const start = direction === 'left' ? 0.75 : 0.25;
  const end = 1 - start;
  const y = bounds.y + Math.min(100, bounds.height / 2);
  const point = (fraction: number) => ({ x: bounds.x + bounds.width * fraction, y });
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [point(start)],
  });
  for (let step = 1; step <= 5; step++) {
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [point(start + ((end - start) * step) / 5)],
    });
  }
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await target
    .page()
    .evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
  await expect(target).toBeVisible();
}

test('手机工具面板内横滑不关闭弹层，返回仍逐层关闭', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chrome');
  test.setTimeout(90_000);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '我的书架' })).toBeVisible();
  const library = await (await page.request.get('/api/state/library')).json();
  library.state.books = [
    ...(library.state.books ?? []).filter((book: { id: string }) => book.id !== demoBooks[0].id),
    demoBooks[0],
  ];
  expect((await page.request.put('/api/state/library', { data: library })).status()).toBe(204);
  await page.goto(`/books/${demoBooks[0].id}`);
  const readerUrl = page.url();
  const session = await page.context().newCDPSession(page);
  const open = page.getByRole('button', { name: '打开更多功能，默认显示 AI 助手' });
  const tabs = page.getByRole('navigation', { name: '切换更多功能' });
  await open.click();
  await swipe(session, page.locator('.mobile-assistant-sheet .right-panel__body'), 'left');
  await swipe(session, page.locator('.mobile-assistant-sheet .right-panel__body'), 'right');
  await swipe(session, tabs, 'left');
  await swipe(session, tabs, 'right');
  for (const name of [
    '打开笔记',
    '打开高亮',
    '打开评论',
    '打开对话历史',
    '打开阅读轨迹',
    '打开阅读样式设置',
  ]) {
    await tabs.getByRole('button', { name, exact: true }).click();
    const content = page.locator(
      '.mobile-assistant-sheet .right-panel__body, .mobile-style-panel__body',
    );
    await swipe(session, content, 'left');
    await swipe(session, content, 'right');
    expect(page.url()).toBe(readerUrl);
  }
  await tabs.getByRole('button', { name: '打开 AI 助手', exact: true }).click();
  await page.getByRole('button', { name: '打开 AI 助手设置' }).click();
  const settings = page.getByRole('dialog', { name: 'AI 助手设置' });
  await expect(settings).toBeVisible();
  await swipe(session, settings, 'left');
  await page.evaluate(() => window.history.back());
  await expect(settings).toBeHidden();
  await expect(tabs).toBeVisible();
  await page.evaluate(() => window.history.back());
  await expect(tabs).toBeHidden();
  expect(page.url()).toBe(readerUrl);
  await page.getByRole('button', { name: '打开书籍目录' }).click();
  const toc = page.locator('.mobile-toc-sheet .toc-panel');
  await swipe(session, toc, 'left');
  await swipe(session, toc, 'right');
  await page.evaluate(() => window.history.back());
  await expect(toc).toBeHidden();
  await open.click();
  await expect(tabs).toBeVisible();
  await page
    .locator('.mobile-assistant-sheet .semi-sidesheet-mask')
    .click({ position: { x: 100, y: 20 } });
  await expect(tabs).toBeHidden();
  expect(page.url()).toBe(readerUrl);
  await session.detach();
});
