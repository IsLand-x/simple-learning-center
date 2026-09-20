import { expect, test } from '@playwright/test';
import { demoBooks } from '../../src/data/demo';

test('目录连续跳转可恢复原位置，轨迹在同一区域展示剩余时间', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chrome');
  test.setTimeout(120_000);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '我的书架' })).toBeVisible();
  const library = await (await page.request.get('/api/state/library')).json();
  const book = {
    ...demoBooks[0],
    id: 'demo-reading-progress',
    updatedAt: Date.now(),
    currentCfi: 'demo:chapter-3:scroll:0.400000',
    currentChapter: demoBooks[0].toc[2].label,
  };
  library.state.books = [
    ...(library.state.books ?? []).filter((item: { id: string }) => item.id !== book.id),
    book,
  ];
  const reading = await (await page.request.get('/api/state/reading')).json();
  reading.state.readingSessions = [
    {
      id: 'estimate-test',
      bookId: book.id,
      startedAt: Date.now() - 1800_000,
      endedAt: Date.now(),
      durationMs: 1800_000,
    },
  ];
  expect((await page.request.put('/api/state/library', { data: library })).status()).toBe(204);
  expect((await page.request.put('/api/state/reading', { data: reading })).status()).toBe(204);
  for (const width of [375, 768, 1024, 1440]) {
    for (const theme of ['light', 'dark']) {
      await page.setViewportSize({ width, height: 667 });
      await page.goto(`/books/${book.id}`);
      await page.locator('.demo-reader').waitFor();
      await page.evaluate((mode) => document.body.setAttribute('theme-mode', mode), theme);
      const mobile = width <= 800;
      const readBook = async () => {
        const result = await (await page.request.get('/api/state/library')).json();
        return result.state.books.find((item: { id: string }) => item.id === book.id);
      };
      await expect
        .poll(async () => (await readBook()).currentCfi)
        .toContain('demo:chapter-3:scroll:');
      const actualCfi = await page.locator('.demo-reader').evaluate((element) => {
        const maximum = Math.max(0, element.scrollHeight - element.clientHeight);
        const ratio = maximum ? element.scrollTop / maximum : 0;
        return `demo:chapter-3:scroll:${ratio.toFixed(6)}`;
      });
      await expect.poll(async () => (await readBook()).currentCfi).toBe(actualCfi);
      const original = actualCfi;
      const toc = page.locator('.toc-panel:visible');
      const openToc = async () => {
        if (!(await toc.isVisible()))
          await page.getByRole('button', { name: '打开书籍目录' }).click();
      };
      await openToc();
      await expect(toc.getByRole('button', { name: '回到原进度' })).toHaveCount(0);
      for (const index of [6, 0]) {
        await openToc();
        await toc.getByRole('button', { name: book.toc[index].label, exact: true }).click();
        if (mobile) await expect(toc).toBeHidden();
        await expect
          .poll(async () => (await readBook()).currentCfi)
          .toContain(`demo:chapter-${index + 1}:`);
      }
      await openToc();
      const back = toc.getByRole('button', { name: '回到原进度' });
      await expect(back).toBeVisible();
      const bounds = (await back.boundingBox())!;
      expect(bounds.height).toBeGreaterThanOrEqual(44);
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
      await page.screenshot({ path: testInfo.outputPath(`toc-${width}-${theme}.png`) });
      await back.focus();
      await expect(back).toBeFocused();
      await back.press('Enter');
      if (mobile) await expect(toc).toBeHidden();
      await expect.poll(async () => (await readBook()).currentCfi).toBe(original);
      await openToc();
      await expect(toc.getByRole('button', { name: '回到原进度' })).toHaveCount(0);
      if (mobile) {
        await page.getByRole('button', { name: '收起书籍目录' }).click();
        await expect(toc).toBeHidden();
        await page.getByRole('button', { name: '打开更多功能，默认显示 AI 助手' }).click();
        await page.getByRole('button', { name: '打开阅读轨迹', exact: true }).click();
      } else {
        await page.getByRole('button', { name: '打开轨迹', exact: true }).click();
      }
      const card = page.locator('.reading-total-card');
      await expect(card.getByText('累计阅读时间')).toBeVisible();
      await expect(card.getByText('预计阅读时间')).toBeVisible();
      await expect(card.getByText(/还需约/)).toBeVisible();
      expect(await card.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`reading-${width}-${theme}.png`) });
    }
  }
});
