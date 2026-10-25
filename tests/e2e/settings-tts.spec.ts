import { expect, test } from '@playwright/test';
import { expectSemiButtonSize } from './semi-button-size';

test('独立 TTS 设置可保存、刷新、留空保留密钥、试听和删除，并适配亮暗主题', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chrome');
  test.setTimeout(120_000);
  page.setDefaultTimeout(10_000);
  await page.request.delete('/api/settings/tts');
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: '设置', exact: true })).toBeVisible({
    timeout: 30_000,
  });
  await page.getByRole('tab', { name: 'TTS', exact: true }).click();
  await expect(page).toHaveURL(/tab=tts/);
  const form = page.getByRole('region', { name: 'TTS 语音配置' });
  const save = form.getByRole('button', { name: '保存 TTS 配置' });
  const preview = form.getByRole('button', { name: '试听已保存配置' });
  const key = form.getByLabel('TTS API Key');
  await expect(preview).toBeDisabled();
  await save.click();
  await expect(form.getByRole('alert')).toContainText('请填写百炼 API Key');
  await key.fill('fixture-tts-private-key');
  await save.click();
  await expect(key).toHaveValue('');
  await expect(key).toHaveAttribute('placeholder', '已保存，留空保留现有密钥');
  await expect(preview).toBeEnabled();
  const status = await (await page.request.get('/api/settings/tts')).json();
  expect(status.configured).toBe(true);
  expect(JSON.stringify(status)).not.toContain('fixture-tts-private-key');
  const preferences = await (await page.request.get('/api/state/preferences')).text();
  expect(preferences).not.toContain('fixture-tts-private-key');
  await page.reload();
  await expect(key).toHaveValue('');
  const voice = form.getByRole('combobox', { name: '音色', exact: true });
  await voice.click();
  await page.getByRole('option').filter({ hasText: '晨煦' }).click();
  await save.click();
  await expect(voice).toContainText('晨煦');
  expect((await (await page.request.get('/api/settings/tts')).json()).configured).toBe(true);

  await page.route('**/api/settings/tts/test', (route) =>
    route.fulfill({ status: 502, json: { error: '百炼试听失败，请检查账户配置' } }),
  );
  await preview.click();
  await expect(form.getByRole('alert')).toContainText('百炼试听失败');
  await expect(preview).toBeEnabled();

  for (const width of [375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const theme of ['light', 'dark']) {
      await page
        .locator('body')
        .evaluate((body, value) => body.setAttribute('theme-mode', value), theme);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await save.scrollIntoViewIfNeeded();
      await save.focus();
      await expect(save).toBeFocused();
      await expectSemiButtonSize(save);
      await voice.click();
      await expect(page.getByRole('option').filter({ hasText: '晨煦' })).toBeVisible();
      await page.keyboard.press('Escape');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      expect(await form.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
        true,
      );
      await page.screenshot({ path: testInfo.outputPath(`tts-${width}-${theme}.png`) });
    }
  }
  await form.getByRole('button', { name: '删除配置', exact: true }).click();
  await expect(page.getByText('删除 TTS 配置？', { exact: true })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(preview).toBeDisabled();
  await page.reload();
  await expect(preview).toBeDisabled();
});
