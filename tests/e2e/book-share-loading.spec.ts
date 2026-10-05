import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

async function expectHorizontalLoading(page: Page, text: string) {
  const status = page.getByRole('status', { name: text });
  await expect(status).toBeVisible();
  const spinner = await status.locator('.semi-spin').boundingBox();
  const label = status.getByText(text, { exact: true });
  const labelBox = await label.boundingBox();
  expect(spinner).not.toBeNull();
  expect(labelBox).not.toBeNull();
  expect(labelBox!.x).toBeGreaterThan(spinner!.x + spinner!.width);
  expect(
    Math.abs(labelBox!.y + labelBox!.height / 2 - spinner!.y - spinner!.height / 2),
  ).toBeLessThan(2);
  expect(labelBox!.height).toBeLessThan(28);
  expect(await label.evaluate((element) => getComputedStyle(element).whiteSpace)).toBe('nowrap');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

for (const theme of ['light', 'dark']) {
  for (const width of [375, 768, 1024, 1440]) {
    test(`分享与 EPUB 加载提示横向排列 ${theme} ${width}`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'desktop-chrome', '同一固定浏览器覆盖全部代表宽度');
      const token = 'a'.repeat(64);
      let releaseMetadata = () => {};
      let releaseEpub = () => {};
      const metadataGate = new Promise<void>((resolve) => {
        releaseMetadata = resolve;
      });
      const epubGate = new Promise<void>((resolve) => {
        releaseEpub = resolve;
      });
      await page.setViewportSize({ width, height: 900 });
      await page.route(`**/api/public/book-shares/${token}`, async (route) => {
        await metadataGate;
        await route.fulfill({ json: { title: '加载布局测试', author: '示例作者' } });
      });
      await page.route(`**/api/public/book-shares/${token}/cover`, (route) =>
        route.fulfill({ status: 404 }),
      );
      await page.route(`**/api/public/book-shares/${token}/douban`, (route) =>
        route.fulfill({ status: 503 }),
      );
      await page.route(`**/api/public/book-shares/${token}/epub`, async (route) => {
        await epubGate;
        await route.fulfill({
          contentType: 'application/epub+zip',
          body: await readFile(new URL('../fixtures/reader-regression.epub', import.meta.url)),
        });
      });
      try {
        await page.goto(`/share/${token}`);
        await page.evaluate((mode) => document.body.setAttribute('theme-mode', mode), theme);
        await expectHorizontalLoading(page, '正在加载分享');
        await page.screenshot({ path: testInfo.outputPath(`share-loading-${theme}-${width}.png`) });
        releaseMetadata();
        await page.getByRole('button', { name: '预览书籍' }).click();
        await expectHorizontalLoading(page, '正在加载书籍');
        await page.screenshot({ path: testInfo.outputPath(`epub-loading-${theme}-${width}.png`) });
        releaseEpub();
        await expect(page.getByRole('button', { name: '下一页' })).toBeEnabled();
        await expect(page.getByRole('status', { name: '正在加载书籍' })).toBeHidden();
      } finally {
        releaseMetadata();
        releaseEpub();
      }
    });
  }
}
