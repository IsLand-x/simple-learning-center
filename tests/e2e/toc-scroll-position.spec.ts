import { expect, test } from '@playwright/test';
import { demoBooks } from '../../src/util/fixtures/demo';

test('同步阅读状态保留手动目录滚动，切换章节和重新展开仍定位当前章节', async ({
  page,
}, testInfo) => {
  const mobile = testInfo.project.name === 'mobile-chrome';
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '我的书架' })).toBeVisible({ timeout: 20_000 });
  const book = {
    ...demoBooks[0],
    // Each project keeps its own reading position in the shared data service.
    id: `demo-toc-scroll-${testInfo.project.name}-${testInfo.repeatEachIndex}`,
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
      return current.state.books.find((item: { id: string }) => item.id === book.id)?.currentCfi;
    })
    .toBe('demo:chapter-1:scroll:0.000000');
  // Move away from the current chapter, as when browsing a long table of contents.
  await list.evaluate((element) => {
    element.scrollTop = 1000;
  });
  await expect.poll(() => list.evaluate((element) => element.scrollTop)).toBe(1000);

  // A newer server snapshot recreates the TOC array without changing the chapter.
  const updated = await (await page.request.get('/api/state/library')).json();
  const updatedBook = updated.state.books.find((item: { id: string }) => item.id === book.id);
  expect(updatedBook).toBeDefined();
  updatedBook.progress = 43;
  updatedBook.updatedAt = Date.now() + 1;
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

  await toc.getByRole('button', { name: '定位当前章节', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => list.evaluate((element) => element.scrollTop)).toBe(0);
  await expect(toc.locator('.toc-item--selected')).toContainText('第 1 章');

  await toc.getByRole('button', { name: '第 60 章', exact: true }).click();
  if (mobile) {
    await expect(toc).toBeHidden();
    await page.getByRole('button', { name: '打开书籍目录' }).click();
  }
  await expect(toc.locator('.toc-item--selected')).toContainText('第 60 章');
  await expect(toc.locator('.toc-item--selected')).toBeInViewport();
  await expect
    .poll(async () => {
      const current = await (await page.request.get('/api/state/library')).json();
      return current.state.books.find((item: { id: string }) => item.id === book.id)?.currentCfi;
    })
    .toBe('demo:chapter-60:scroll:0.000000');

  // Explicit location centers the current chapter without navigating or closing the TOC.
  const readerPosition = await page.locator('.reader-header__title').textContent();
  await list.evaluate((element) => {
    element.scrollTop = 0;
  });
  await toc.getByRole('button', { name: '定位当前章节', exact: true }).click();
  await expect(toc).toBeVisible();
  await expect(toc.locator('.toc-item--selected')).toContainText('第 60 章');
  expect(
    await list.evaluate((element) => {
      const item = element.querySelector<HTMLElement>('.toc-item--selected')!;
      return Math.abs(
        item.getBoundingClientRect().top +
          item.clientHeight / 2 -
          element.getBoundingClientRect().top -
          element.clientHeight / 2,
      );
    }),
  ).toBeLessThan(2);
  expect(await page.locator('.reader-header__title').textContent()).toBe(readerPosition);

  await list.evaluate((element) => {
    element.scrollTop = 0;
  });
  await page.getByRole('button', { name: '收起书籍目录' }).click();
  await expect(toc).toBeHidden();
  await page.getByRole('button', { name: /^(打开|展开)书籍目录$/ }).click();
  await expect(toc.locator('.toc-item--selected')).toBeInViewport();
});
