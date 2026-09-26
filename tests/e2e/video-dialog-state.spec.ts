import { expect, test } from '@playwright/test';
import { prepareWorkspace } from './workspace-fixtures';

test.use({ locale: 'zh-CN', timezoneId: 'Asia/Shanghai', serviceWorkers: 'block' });
test.beforeEach(async ({ page }) => prepareWorkspace(page));

test('视频导入草稿在取消重开和桌面移动布局切换时保留', async ({ page }) => {
  await page.goto('/videos');
  await page.getByRole('button', { name: '添加 YouTube 视频' }).click();
  const dialog = page.getByRole('dialog', { name: '添加 YouTube 视频' });
  const input = dialog.getByPlaceholder('https://www.youtube.com/watch?v=...');
  const draft = 'https://www.youtube.com/watch?v=draftExample';
  await input.fill(draft);
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole('button', { name: '添加 YouTube 视频' }).click();
  await expect(input).toHaveValue(draft);
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(input).toHaveValue(draft);
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(input).toHaveValue(draft);
});
