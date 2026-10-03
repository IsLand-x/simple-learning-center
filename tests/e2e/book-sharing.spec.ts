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
  await guest.route('**/api/public/book-shares/*/douban', (route) =>
    route.fulfill({
      json: {
        status: 'matched',
        title: book.title,
        description: '这是一段用于验证分享页的原创简介。',
        rating: 8.6,
        url: 'https://book.douban.com/subject/1234/',
        reviewsUrl: 'https://book.douban.com/subject/1234/reviews',
        reviews: [
          {
            title: '读书时如何思考',
            author: '示例读者',
            url: 'https://book.douban.com/review/5678/',
          },
        ],
        fetchedAt: 1,
      },
    }),
  );
  await guest.goto(shareUrl);
  await expect(guest.getByText('朋友送给你了这本书，快来看看吧')).toBeVisible();
  await expect(guest.getByText('这是一段用于验证分享页的原创简介。')).toBeVisible();
  await expect(guest.getByText('豆瓣评分 8.6')).toBeVisible();
  await expect(guest.getByRole('link', { name: '读书时如何思考' })).toHaveAttribute(
    'href',
    'https://book.douban.com/review/5678/',
  );
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
      await guest.getByRole('region', { name: '豆瓣书籍信息' }).scrollIntoViewIfNeeded();
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
  const historyLength = await guest.evaluate(() => window.history.length);
  await guest.getByRole('button', { name: '预览书籍' }).click();
  await expect(guest.getByRole('button', { name: '下一页' })).toBeEnabled();
  await guest.getByRole('button', { name: '返回分享页' }).click();
  await expect(guest.getByRole('button', { name: '预览书籍' })).toBeVisible();
  expect(await guest.evaluate(() => window.history.length)).toBe(historyLength);
  await guest.reload();
  await expect(guest.getByRole('button', { name: '预览书籍' })).toBeVisible();
  await guest.unroute('**/api/public/book-shares/*/douban');
  await guest.route('**/api/public/book-shares/*/douban', (route) =>
    route.fulfill({
      json: {
        status: 'unavailable',
        searchUrl: 'https://search.douban.com/book/subject_search?search_text=test&cat=1001',
      },
    }),
  );
  await guest.reload();
  await expect(guest.getByText('豆瓣信息暂时无法获取')).toBeVisible();
  await expect(guest.getByRole('button', { name: '下载 EPUB' })).toBeEnabled();
  expect(privateRequests).toEqual([]);
  expect((await guest.request.get(`/api/public/book-shares/${shareToken}`)).ok()).toBe(true);
  await page.request.delete(`/api/books/${book.id}/share`);
  await guest.reload();
  await expect(guest.getByText('无法打开分享', { exact: true })).toBeVisible();
  await context.close();
});
