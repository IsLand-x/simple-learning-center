import { expect, test } from '@playwright/test';
import { prepareWorkspace } from './workspace-fixtures';

test.use({ reducedMotion: 'reduce', serviceWorkers: 'block' });

for (const theme of ['light', 'dark'] as const) {
  for (const viewport of [
    { width: 375, height: 812 },
    { width: 768, height: 1024 },
    { width: 1024, height: 768 },
    { width: 1440, height: 900 },
  ]) {
    test(`启动等待提示使用主题文字色并区分连接与数据读取 ${theme} ${viewport.width}`, async ({
      page,
    }, testInfo) => {
      test.skip(testInfo.project.name !== 'desktop-chrome');
      await page.setViewportSize(viewport);
      // Playwright's fake clock replaces Performance, including User Timing.
      // Waiting screenshots contain no dates; keep native timing for this test.
      await prepareWorkspace(page, { theme, visualOnly: true, fixedTime: false });
      await page.addInitScript((mode) => {
        sessionStorage.setItem('learning-center-theme-mode', mode);
      }, theme);
      const session = Promise.withResolvers<void>();
      const state = Promise.withResolvers<void>();
      await page.route('**/api/auth/session', async (route) => {
        await session.promise;
        await route.fulfill({ json: { mode: 'local', authenticated: true } });
      });
      await page.route('**/api/state/*', async (route) => {
        await state.promise;
        await route.fallback();
      });
      try {
        await page.goto('/', { waitUntil: 'domcontentloaded' });
        const status = page.getByRole('status');
        await expect(status).toHaveText('正在连接数据服务…');
        await expect(page.locator('body')).toHaveAttribute('theme-mode', theme);
        const color = await status.evaluate((element) => getComputedStyle(element).color);
        const channels = color
          .match(/[\d.]+/g)!
          .slice(0, 3)
          .map(Number);
        channels.forEach((channel) => {
          if (theme === 'dark') expect(channel).toBeGreaterThan(180);
          else expect(channel).toBeLessThan(130);
        });
        await expect(page).toHaveScreenshot(`bootstrap-${theme}-${viewport.width}.png`, {
          animations: 'disabled',
          caret: 'hide',
          maxDiffPixelRatio: 0.001,
        });
        session.resolve();
        await expect(status).toHaveText('正在读取页面数据…');
        state.resolve();
        await expect(page.getByRole('heading', { name: '我的书架' })).toBeVisible();
        const stages = await page.evaluate(() =>
          performance.getEntriesByType('measure').map((entry) => entry.name),
        );
        expect(stages).toEqual(
          expect.arrayContaining([
            'learning-center:startup:session',
            'learning-center:state:preferences',
            'learning-center:state:library',
            'learning-center:startup:state-preparation',
            'learning-center:startup:rehydration',
          ]),
        );
        expect(
          await page.locator('body').evaluate((body) => body.scrollWidth <= window.innerWidth),
        ).toBe(true);
      } finally {
        session.resolve();
        state.resolve();
      }
    });
  }
}
