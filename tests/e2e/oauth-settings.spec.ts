import { expectSemiButtonSize } from './semi-button-size';
import { expect, test } from '@playwright/test';

test('OAuth 设置支持设备授权、取消、完成与退出，并适配亮暗主题及代表宽度', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chrome');
  test.setTimeout(90_000);
  const provider = {
    id: 'openai-codex',
    connected: false,
    models: ['oauth-test-model'],
    login: null as null | { state: string; userCode?: string; url?: string; message?: string },
  };
  await page.route('**/api/ai/oauth/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() !== 'GET') expect(request.headers()['x-learning-center-oauth']).toBe('1');
    if (request.method() === 'POST')
      provider.login = {
        state: 'pending',
        userCode: 'TEST-1234',
        url: 'https://auth.openai.com/codex/device',
      };
    if (request.method() === 'DELETE') {
      provider.login = null;
      if (!path.endsWith('/login')) provider.connected = false;
    }
    await route.fulfill({
      json: path.endsWith('/providers')
        ? [provider, { id: 'kimi-coding', connected: false, models: ['kimi-test'], login: null }]
        : provider,
    });
  });
  await page.goto('/settings');
  const panel = page.getByRole('region', { name: 'OAuth 账号登录' });
  await expect(panel.getByRole('button', { name: '登录 ChatGPT / Codex' })).toBeVisible();
  for (const width of [375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const theme of ['light', 'dark']) {
      await page
        .locator('body')
        .evaluate((body, value) => body.setAttribute('theme-mode', value), theme);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const login = panel.getByRole('button', { name: '登录 ChatGPT / Codex' });
      await login.scrollIntoViewIfNeeded();
      const box = await login.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
      await expectSemiButtonSize(login);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await login.focus();
      await expect(login).toBeFocused();
      await page.screenshot({ path: testInfo.outputPath(`oauth-${width}-${theme}.png`) });
    }
  }
  await panel.getByRole('button', { name: '登录 ChatGPT / Codex' }).click();
  await expect(panel.getByText('设备验证码：TEST-1234')).toBeVisible();
  await expect(panel.getByRole('link', { name: '打开官方授权页' })).toHaveAttribute(
    'rel',
    'noopener noreferrer',
  );
  await panel.getByRole('button', { name: '取消授权' }).click();
  await expect(panel.getByText('设备验证码：TEST-1234')).toBeHidden();
  await panel.getByRole('button', { name: '登录 ChatGPT / Codex' }).click();
  await expect(panel.getByText('设备验证码：TEST-1234')).toBeVisible();
  provider.connected = true;
  provider.login = { state: 'completed' };
  await expect(panel.getByRole('button', { name: '重新登录' })).toBeVisible();
  await expect
    .poll(async () => {
      const response = await page.request.get('/api/state/preferences');
      const data = await response.json();
      return data.state.openAIConfigs.some(
        (config: { oauthProvider?: string }) => config.oauthProvider === 'openai-codex',
      );
    })
    .toBe(true);
  await panel.getByRole('button', { name: '退出登录', exact: true }).click();
  await expect(
    page.getByRole('dialog').getByRole('button', { name: 'confirm', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(panel.getByRole('button', { name: '登录 ChatGPT / Codex' })).toBeVisible();
  provider.login = { state: 'failed', message: '授权失败，请重新登录。' };
  await expect(panel.getByRole('alert')).toContainText('授权失败');
});
