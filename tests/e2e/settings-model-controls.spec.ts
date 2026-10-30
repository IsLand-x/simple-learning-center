import { expect, test } from '@playwright/test';
import { expectSemiButtonSize } from './semi-button-size';
import { prepareWorkspace } from './workspace-fixtures';

// API-key import/export removal must leave direct model editing usable.
test('模型设置移除导入导出和冗余提示，普通按钮沿用 Semi 尺寸', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chrome');
  // Eight viewport/theme combinations each navigate and persist settings.
  test.setTimeout(120_000);
  await prepareWorkspace(page, { fixedTime: false });
  const snapshot = await (await page.request.get('/api/state/preferences')).json();
  snapshot.state.openAIConfigs = [];
  await page.request.put('/api/state/preferences', { data: snapshot });
  for (const width of [375, 768, 1024, 1440]) {
    for (const theme of ['light', 'dark']) {
      await page.setViewportSize({ width, height: 900 });
      snapshot.state.themeMode = theme;
      await page.request.put('/api/state/preferences', { data: snapshot });
      await page.goto('/settings?tab=models');
      await expect(page.getByRole('button', { name: /导入 API Key|导出 API Key/ })).toHaveCount(0);
      await expect(page.getByText('添加 API Key 模型，或在上方完成账号授权后开始对话')).toHaveCount(
        0,
      );
      await expect(page.getByText('还没有 API Key 模型')).toBeVisible();
      await expectSemiButtonSize(page.getByRole('button', { name: /添加模型$/ }));
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({ path: testInfo.outputPath(`settings-${width}-${theme}.png`) });
    }
  }
  await page.getByRole('button', { name: /添加模型$/ }).click();
  await expect(page.getByText('还没有 API Key 模型')).toHaveCount(0);
  await expect(page.getByLabel('API Key', { exact: true })).toBeVisible();
});

test('地址检测批量加入同一个供应商，取消草稿不落盘，并在助手中可选', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await prepareWorkspace(page, { fixedTime: false });
  let requests = 0;
  await page.route('**/api/ai/models/discover', async (route) => {
    requests++;
    expect(route.request().postDataJSON()).toEqual({
      baseUrl: 'https://provider.example',
      apiKey: 'test-key',
    });
    await route.fulfill({
      json: { baseUrl: 'https://provider.example/v1', models: ['model-a', 'model-b', 'model-c'] },
    });
  });
  await page.goto('/settings?tab=models');
  await page.getByRole('button', { name: /添加模型$/ }).click();
  const form = page.locator('.api-config-card--editing');
  await expect(form.getByRole('button', { name: '检测模型' })).toBeDisabled();
  await form.getByLabel('OpenAI 兼容 API 地址').fill('https://provider.example');
  await form.getByLabel('API Key', { exact: true }).fill('test-key');
  expect(requests).toBe(0);
  await form.getByRole('button', { name: '取消', exact: true }).click();
  expect(
    (await (await page.request.get('/api/state/preferences')).json()).state.openAIConfigs,
  ).toEqual([]);
  await page.getByRole('button', { name: /添加模型$/ }).click();
  await form.getByLabel('OpenAI 兼容 API 地址').fill('https://provider.example');
  await form.getByLabel('API Key', { exact: true }).fill('test-key');
  await form.getByRole('button', { name: '检测模型' }).click();
  await expect(form.getByText('检测到 3 个模型，已选 3 个')).toBeVisible();
  await form.getByRole('button', { name: '清空选择' }).click();
  await expect(form.getByText('检测到 3 个模型，已选 0 个')).toBeVisible();
  await form.getByRole('button', { name: '全部加入' }).click();
  await form.getByRole('combobox', { name: '可选模型' }).click();
  await page.getByRole('option').filter({ hasText: 'model-b' }).click();
  await page.keyboard.press('Escape');
  await expect(form.getByText('检测到 3 个模型，已选 2 个')).toBeVisible();
  await form.getByRole('button', { name: '添加供应商（2 个模型）' }).click();
  await expect(page.getByRole('button', { name: '编辑 provider.example' })).toBeVisible();
  await expect
    .poll(async () => {
      const snapshot = await (await page.request.get('/api/state/preferences')).json();
      return snapshot.state.openAIConfigs.map(
        (config: { name: string; baseUrl: string; models: string[] }) => ({
          name: config.name,
          baseUrl: config.baseUrl,
          models: config.models,
        }),
      );
    })
    .toEqual([
      {
        name: 'provider.example',
        baseUrl: 'https://provider.example/v1',
        models: ['model-a', 'model-c'],
      },
    ]);
  await page.reload();
  await expect(page.getByRole('button', { name: '编辑 provider.example' })).toBeVisible();
  expect(requests).toBe(1);
  await page.goto('/books/demo-data-intensive');
  if (testInfo.project.name === 'mobile-chrome')
    await page.locator('.reader-toolbar--mobile button').last().click();
  else await page.locator('.activity-bar button').first().click();
  await page.locator('.ai-composer-model-cascader').click();
  if (testInfo.project.name === 'mobile-chrome')
    await page.getByText('provider.example', { exact: true }).click();
  else await page.getByText('provider.example', { exact: true }).hover();
  await expect(page.getByRole('menuitem').filter({ hasText: /^model-a$/ })).toBeVisible();
  await expect(page.getByRole('menuitem').filter({ hasText: /^model-c$/ })).toBeVisible();
  await expect(page.getByRole('menuitem').filter({ hasText: /^model-b$/ })).toHaveCount(0);
});

test('检测失败保留手动添加，重新检测已有供应商不产生重复配置', async ({ page }) => {
  await prepareWorkspace(page, { fixedTime: false });
  let fail = true;
  await page.route('**/api/ai/models/discover', (route) =>
    route.fulfill(
      fail
        ? { status: 502, json: { error: '供应商拒绝访问，请检查 API Key 和模型列表权限' } }
        : { json: { baseUrl: 'https://manual.example/v1', models: ['new-model'] } },
    ),
  );
  await page.goto('/settings?tab=models');
  await page.getByRole('button', { name: /添加模型$/ }).click();
  const form = page.locator('.api-config-card--editing');
  await form.getByLabel('模型配置名称').fill('手动供应商');
  await form.getByLabel('OpenAI 兼容 API 地址').fill('https://manual.example/v1');
  await form.getByRole('button', { name: '检测模型' }).click();
  await expect(form.getByRole('alert')).toContainText('请检查 API Key');
  await form.getByRole('textbox', { name: '可选模型' }).fill('manual-model, manual-model');
  await form.getByRole('button', { name: '添加供应商（1 个模型）' }).click();
  await page.getByRole('button', { name: '编辑 手动供应商' }).click();
  fail = false;
  await form.getByRole('button', { name: '检测模型' }).click();
  await expect(form.getByText('检测到 1 个模型，已选 2 个')).toBeVisible();
  await form.getByRole('button', { name: '保存配置' }).click();
  await expect
    .poll(async () => {
      const snapshot = await (await page.request.get('/api/state/preferences')).json();
      return snapshot.state.openAIConfigs.map((config: { models: string[] }) => config.models);
    })
    .toEqual([['manual-model', 'new-model']]);
});

test('检测编辑器适配代表宽度与亮暗主题，长模型 ID 不撑破面板', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chrome');
  test.setTimeout(120_000);
  await prepareWorkspace(page, { fixedTime: false });
  await page.route('**/api/ai/models/discover', (route) =>
    route.fulfill({
      json: {
        baseUrl: 'https://visual.example/v1',
        models: ['model-' + 'long-name-'.repeat(20), 'model-b', 'model-c', 'model-d'],
      },
    }),
  );
  await page.goto('/settings?tab=models');
  await page.getByRole('button', { name: /添加模型$/ }).click();
  const form = page.locator('.api-config-card--editing');
  await form.getByLabel('OpenAI 兼容 API 地址').fill('https://visual.example/v1');
  await form.getByRole('button', { name: '检测模型' }).click();
  await expect(form.getByText('检测到 4 个模型，已选 4 个')).toBeVisible();
  for (const width of [375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const theme of ['light', 'dark']) {
      await page
        .locator('body')
        .evaluate((body, value) => body.setAttribute('theme-mode', value), theme);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await form.scrollIntoViewIfNeeded();
      await form.getByRole('button', { name: '检测模型' }).focus();
      await expect(form.getByRole('button', { name: '检测模型' })).toBeFocused();
      await expectSemiButtonSize(form.getByRole('button', { name: '检测模型' }));
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      const box = await form.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
      await page.screenshot({ path: testInfo.outputPath(`discovery-${width}-${theme}.png`) });
    }
  }
});
