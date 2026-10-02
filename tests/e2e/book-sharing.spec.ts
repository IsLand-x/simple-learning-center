import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test('三点菜单分享，匿名只读预览、下载及撤销', async ({ page, browser }, testInfo) => {
  test.setTimeout(120_000);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '我的书架' })).toBeVisible();
  const { token } = await (
    await page.request.post('/api/settings/openapi-token', {
      headers: { 'X-Learning-Center-Request': '1' },
    })
  ).json();
  const imported = await page.request.post('/api/openapi/v1/books?filename=share-example.epub', {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/epub+zip' },
    data: await readFile(new URL('../fixtures/reader-regression.epub', import.meta.url)),
  });
  expect(imported.status()).toBe(201);
  const { book } = await imported.json();
  await page.goto(`/books/${book.id}`);
  const more = page.getByRole('button', { name: '更多书籍操作' });
  await expect(more).toBeVisible();
  if (testInfo.project.name === 'mobile-chrome') await more.click();
  else await more.hover();
  await page.getByRole('menuitem', { name: '分享', exact: true }).click();
  await expect(page).toHaveURL(/\/share\/[a-f0-9]{64}$/);
  const shareUrl = page.url();
  const shareToken = shareUrl.split('/').pop()!;
  const context = await browser.newContext({
    viewport: { width: 375, height: 812 },
    acceptDownloads: true,
  });
  const guest = await context.newPage();
  const privateRequests: string[] = [];
  guest.on('request', (request) => {
    if (request.url().includes('/api/') && !request.url().includes('/api/public/book-shares/'))
      privateRequests.push(request.url());
  });
  await guest.route('**/api/auth/**', (route) => route.fulfill({ status: 401 }));
  await guest.goto(shareUrl);
  await expect(guest.getByText('朋友送给你了这本书，快来看看吧')).toBeVisible();
  for (const theme of ['light', 'dark']) {
    await guest.evaluate((mode) => {
      document.body.setAttribute('theme-mode', mode);
    }, theme);
    for (const width of [375, 768, 1024, 1440]) {
      await guest.setViewportSize({ width, height: 900 });
      await expect(guest.getByRole('heading', { name: book.title })).toBeVisible();
      expect(await guest.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await guest.screenshot({ path: testInfo.outputPath(`share-${theme}-${width}.png`) });
    }
  }
  await guest.setViewportSize({ width: 375, height: 812 });
  const downloadEvent = guest.waitForEvent('download');
  await guest.getByRole('button', { name: '下载 EPUB' }).click();
  expect((await downloadEvent).suggestedFilename()).toBe(`${book.title}.epub`);
  await guest.getByRole('button', { name: '预览书籍' }).click();
  await expect(guest.getByRole('button', { name: '下一页' })).toBeEnabled();
  await expect.poll(() => guest.frames().some((frame) => frame !== guest.mainFrame())).toBe(true);
  await expect(guest.getByRole('button', { name: 'AI', exact: true })).toHaveCount(0);
  await expect(guest.getByText('资源库', { exact: true })).toHaveCount(0);
  await expect(guest.getByText('高亮', { exact: true })).toHaveCount(0);
  const first = await guest
    .locator('foliate-view')
    .evaluate(
      (element) => (element as HTMLElement & { lastLocation?: { cfi?: string } }).lastLocation?.cfi,
    );
  await guest.getByRole('button', { name: '下一页' }).click();
  await expect
    .poll(() =>
      guest
        .locator('foliate-view')
        .evaluate(
          (element) =>
            (element as HTMLElement & { lastLocation?: { cfi?: string } }).lastLocation?.cfi,
        ),
    )
    .not.toBe(first);
  await guest.goBack();
  await expect(guest.getByRole('button', { name: '预览书籍' })).toBeVisible();
  await guest.reload();
  await expect(guest.getByRole('button', { name: '预览书籍' })).toBeVisible();
  expect(privateRequests).toEqual([]);
  expect((await guest.request.get(`/api/public/book-shares/${shareToken}`)).ok()).toBe(true);
  await page.request.delete(`/api/books/${book.id}/share`);
  await guest.reload();
  await expect(guest.getByText('无法打开分享', { exact: true })).toBeVisible();
  await context.close();
});
