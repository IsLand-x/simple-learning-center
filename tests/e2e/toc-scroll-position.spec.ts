import { expect, test } from '@playwright/test';
import { demoBooks } from '../../src/data/demo';

test('同步阅读状态保留手动目录滚动，切换章节和重新展开仍定位当前章节', async ({
  page,
}, testInfo) => {
  const mobile = testInfo.project.name === 'mobile-chrome';
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '我的书架' })).toBeVisible();
  const book = {
    ...demoBooks[0],
    id: 'demo-toc-scroll',
    currentChapter: '第 1 章',
    currentCfi: 'demo:chapter-1:scroll:0',
    toc: Array.from({ length: 80 }, (_, index) => ({
      id: `chapter-${index + 1}`,
      href: `chapter-${index + 1}`,
      label: `第 ${index + 1} 章`,
    })),
  };
  const snapshot = await (await page.request.get('/api/state/library')).json();
  snapshot.state.books = [book];
  expect((await page.request.put('/api/state/library', { data: snapshot })).status()).toBe(204);
  await page.goto(`/books/${book.id}`);
  await expect(page.locator('.demo-reader')).toBeVisible();
  if (mobile) await page.getByRole('button', { name: '打开书籍目录' }).click();
  const toc = page.locator('.toc-panel:visible');
  const list = toc.getByRole('navigation', { name: '书籍目录' });
  await expect(toc.locator('.toc-item--selected')).toContainText('第 1 章');
  await expect
    .poll(async () => {
      const current = await (await page.request.get('/api/state/library')).json();
      return current.state.books[0].currentCfi;
    })
    .toBe('demo:chapter-1:scroll:0.000000');
  // Move away from the current chapter, as when browsing a long table of contents.
  await list.evaluate((element) => {
    element.scrollTop = 1000;
  });
  await expect.poll(() => list.evaluate((element) => element.scrollTop)).toBe(1000);

  // A newer server snapshot recreates the TOC array without changing the chapter.
  const updated = await (await page.request.get('/api/state/library')).json();
  updated.state.books[0].progress = 43;
  updated.state.books[0].updatedAt = Date.now() + 5000;
  expect((await page.request.put('/api/state/library', { data: updated })).status()).toBe(204);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(toc.getByRole('status')).toHaveText('43% · 80 章');
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
  expect(await list.evaluate((element) => element.scrollTop)).toBe(1000);

  await toc.getByRole('button', { name: '第 60 章', exact: true }).click();
  if (mobile) {
    await expect(toc).toBeHidden();
    await page.getByRole('button', { name: '打开书籍目录' }).click();
  }
  await expect(toc.locator('.toc-item--selected')).toContainText('第 60 章');
  await expect(toc.locator('.toc-item--selected')).toBeInViewport();

  await list.evaluate((element) => {
    element.scrollTop = 0;
  });
  await page.getByRole('button', { name: '收起书籍目录' }).click();
  await expect(toc).toBeHidden();
  await page.getByRole('button', { name: /^(打开|展开)书籍目录$/ }).click();
  await expect(toc.locator('.toc-item--selected')).toBeInViewport();
});
