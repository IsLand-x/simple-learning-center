import { expect, test } from '@playwright/test';
import { prepareWorkspace } from './workspace-fixtures';

test.use({ reducedMotion: 'reduce', serviceWorkers: 'block' });

for (const theme of ['light', 'dark']) {
  for (const width of [375, 768, 1024, 1440]) {
    test(`正文划词光标 ${theme} ${width}`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'desktop-chrome');
      await page.setViewportSize({ width, height: 900 });
      await prepareWorkspace(page, { visualOnly: true, theme });
      await page.goto('/books/demo-data-intensive');
      const article = page.locator('.demo-reader article');
      await expect(article).toBeVisible();
      const bookCursor = await article.evaluate((element) => getComputedStyle(element).cursor);
      if (width > 800) {
        expect(bookCursor).toContain('data:image/svg+xml');
        expect(bookCursor).toContain('16 16');
      } else {
        expect(bookCursor).toBe('text');
      }
      await page.goto('/rss?source=all&range=all&item=e2e-reading-article&view=detail');
      const body = page.locator('.rss-article__body');
      await expect(body).toBeVisible();
      const rssCursor = await body.evaluate((element) => getComputedStyle(element).cursor);
      expect(rssCursor).toContain('data:image/svg+xml');
      expect(rssCursor).toContain('16 16');
      const link = body.locator('a').first();
      if (await link.count()) await expect(link).toHaveCSS('cursor', 'pointer');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.emulateMedia({ forcedColors: 'active' });
      await expect(body).toHaveCSS('cursor', 'text');
    });
  }
}
