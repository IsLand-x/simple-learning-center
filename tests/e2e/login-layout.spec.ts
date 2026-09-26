import { expect, test } from '@playwright/test';

test.use({
  locale: 'zh-CN',
  timezoneId: 'Asia/Shanghai',
  reducedMotion: 'reduce',
  serviceWorkers: 'block',
});

test('unauthenticated login shell keeps its layout across themes and viewports', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chrome');
  test.setTimeout(90_000);
  await page.route('**/api/auth/session', (route) =>
    route.fulfill({ json: { authenticated: false, mode: 'remote', username: null } }),
  );
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '欢迎回来' })).toBeVisible();
  for (const theme of ['light', 'dark']) {
    if ((await page.locator('body').getAttribute('theme-mode')) !== theme) {
      await page.getByRole('button', { name: /切换为[深浅]色主题/ }).click();
    }
    await expect(page.locator('body')).toHaveAttribute('theme-mode', theme);
    for (const viewport of [
      { width: 375, height: 812 },
      { width: 768, height: 1024 },
      { width: 1024, height: 768 },
      { width: 1440, height: 900 },
    ]) {
      await page.setViewportSize(viewport);
      await expect(page.getByRole('button', { name: '登录', exact: true })).toBeDisabled();
      await expect(page.getByPlaceholder('请输入账号')).toBeVisible();
      await page.mouse.move(0, 0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await expect.soft(page).toHaveScreenshot(`login-${theme}-${viewport.width}.png`, {
        animations: 'disabled',
        caret: 'hide',
        maxDiffPixelRatio: 0.001,
      });
    }
  }
});
