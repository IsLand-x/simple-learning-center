import { expect, test } from '@playwright/test';
import { demoBooks } from '../../src/util/fixtures/demo';

for (const width of [375, 768, 1024, 1440]) {
  for (const theme of ['light', 'dark']) {
    test(`AI 设置使用原生 Footer 和小号开关 ${width} ${theme}`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'desktop-chrome');
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto('/');
      await expect(page.getByRole('heading', { name: '我的书架' })).toBeVisible();
      const library = await (await page.request.get('/api/state/library')).json();
      library.state.books = [demoBooks[0]];
      await page.request.put('/api/state/library', { data: library });
      const preferences = await (await page.request.get('/api/state/preferences')).json();
      preferences.state.themeMode = theme;
      preferences.state.aiPreferences = { ...preferences.state.aiPreferences, assistantPrompt: '' };
      await page.request.put('/api/state/preferences', { data: preferences });
      await page.route('**/api/ai/jobs**', (route) => route.fulfill({ json: { jobs: [] } }));
      await page.goto(`/books/${demoBooks[0].id}`);
      if (width <= 800)
        await page.getByRole('button', { name: '打开更多功能，默认显示 AI 助手' }).click();
      else await page.locator('.activity-bar button').first().click();
      await page.mouse.move(20, 450);
      await expect(page.getByText('收起 AI 助手', { exact: true })).toBeHidden();
      await page.getByRole('button', { name: '打开 AI 助手设置' }).click();
      const dialog = page.getByRole('dialog', { name: 'AI 助手设置' });
      await expect(dialog).toBeVisible();
      await expect(
        dialog.locator('.semi-modal-footer').getByRole('button', { name: '保存设置' }),
      ).toBeVisible();
      await expect(dialog.locator('.semi-modal-body .ai-assistant-settings__footer')).toHaveCount(
        0,
      );
      await expect(dialog.locator('.semi-switch-large')).toHaveCount(0);
      const toggle = dialog.getByRole('switch').first();
      const bounds = await toggle.boundingBox();
      expect(bounds!.width).toBeLessThan(40);
      const target = await dialog
        .locator('.ai-assistant-settings__switch-target')
        .first()
        .boundingBox();
      expect(target!.height).toBeGreaterThanOrEqual(44);
      expect(target!.width).toBeGreaterThanOrEqual(44);
      await dialog.getByRole('textbox').fill('先解释结论，再给出依据。');
      await expect(dialog.getByRole('button', { name: '保存设置' })).toBeEnabled();
      await dialog.locator('.semi-modal-body').evaluate((element) => {
        element.scrollTop = element.scrollHeight;
      });
      await expect(dialog.locator('.semi-modal-footer')).toBeInViewport({ ratio: 1 });
      await expect(dialog.getByRole('button', { name: '保存设置' })).toBeInViewport({ ratio: 1 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({ path: testInfo.outputPath(`ai-settings-${theme}-${width}.png`) });
      await dialog.getByRole('button', { name: '保存设置' }).click();
      await expect(dialog).toBeHidden();
    });
  }
}
