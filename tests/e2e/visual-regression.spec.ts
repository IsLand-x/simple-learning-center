import { expect, test } from '@playwright/test';
import { prepareWorkspace } from './workspace-fixtures';

test.use({
  locale: 'zh-CN',
  timezoneId: 'Asia/Shanghai',
  reducedMotion: 'reduce',
  serviceWorkers: 'block',
});

const viewports = [
  { width: 375, height: 812 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
];

const screens = [
  { name: 'library', path: '/', ready: '.library-page' },
  { name: 'reader', path: '/books/demo-data-intensive', ready: '.demo-reader article' },
  { name: 'settings', path: '/settings', ready: '.settings-page' },
];
// Scope intentional baseline updates while normal regressions still cover every screen.
const requestedScreen = process.env.LEARNING_CENTER_E2E_SCREEN;
if (requestedScreen && !screens.some((screen) => screen.name === requestedScreen))
  throw new Error(`未知的视觉验收页面：${requestedScreen}`);

for (const theme of ['light', 'dark']) {
  for (const viewport of viewports) {
    test(`workspace visual parity: ${theme} ${viewport.width}`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'desktop-chrome');
      test.setTimeout(120_000);
      await page.setViewportSize(viewport);
      await prepareWorkspace(page, { visualOnly: true, theme });

      for (const screen of screens.filter(
        (screen) => !requestedScreen || screen.name === requestedScreen,
      )) {
        await page.goto(screen.path);
        await expect(page.locator(screen.ready)).toBeVisible({ timeout: 15_000 });
        await expect(page.locator('body')).toHaveAttribute('theme-mode', theme);
        if (screen.name === 'library') {
          // A progress/recency mismatch can fit below the pixel threshold; assert the fixture too.
          const firstBook = page.locator('.book-card').first();
          await expect(firstBook.getByRole('button', { name: /^打开《/ })).toHaveAttribute(
            'aria-label',
            '打开《Designing Data-Intensive Applications》，已读 0%',
          );
          await expect(firstBook).toContainText('第一章 · 可靠、可扩展与可维护');
          await expect(firstBook).toContainText('1 小时前');
        }
        await page.evaluate(() => document.fonts.ready);
        await page.mouse.move(0, 0);
        await expect(page.locator('.semi-toast[role="alert"]')).toHaveCount(0);
        const dimensions = await page.evaluate(() => ({
          width: document.documentElement.clientWidth,
          scrollWidth: document.documentElement.scrollWidth,
        }));
        expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.width);
        await expect.soft(page).toHaveScreenshot(`${screen.name}-${theme}-${viewport.width}.png`, {
          animations: 'disabled',
          caret: 'hide',
          maxDiffPixelRatio: 0.001,
        });
      }
    });
  }
}
