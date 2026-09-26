import { expect, test } from '@playwright/test';
import { expectSemiButtonSize } from './semi-button-size';

// API-key import/export removal must leave direct model editing usable.
test('模型设置移除导入导出和冗余提示，普通按钮沿用 Semi 尺寸', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chrome');
  await page.goto('/');
  const snapshot = await (await page.request.get('/api/state/preferences')).json();
  snapshot.state.openAIConfigs = [];
  await page.request.put('/api/state/preferences', { data: snapshot });
  for (const width of [375, 768, 1024, 1440]) {
    for (const theme of ['light', 'dark']) {
      await page.setViewportSize({ width, height: 900 });
      snapshot.state.themeMode = theme;
      await page.request.put('/api/state/preferences', { data: snapshot });
      await page.goto('/settings');
      await expect(page.getByRole('button', { name: /导入 API Key|导出 API Key/ })).toHaveCount(0);
      await expect(page.getByText('添加 API Key 模型，或在上方完成账号授权后开始对话')).toHaveCount(
        0,
      );
      await expect(page.getByText('还没有 API Key 模型')).toBeVisible();
      await expectSemiButtonSize(page.getByRole('button', { name: '添加模型', exact: true }));
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({ path: testInfo.outputPath(`settings-${width}-${theme}.png`) });
    }
  }
  await page.getByRole('button', { name: '添加模型', exact: true }).click();
  await expect(page.getByText('还没有 API Key 模型')).toHaveCount(0);
  await expect(page.getByLabel('API Key', { exact: true })).toBeVisible();
});
