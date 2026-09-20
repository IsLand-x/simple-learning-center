import { expect, test } from '@playwright/test';

test('软件信息显示机器配置，并支持刷新、失败重试和亮暗主题', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chrome');
  test.setTimeout(90_000);
  let fail = false;
  let totalBytes = 8 * 1024 ** 3;
  await page.route('**/api/settings/system-info', (route) =>
    route.fulfill({
      status: fail ? 503 : 200,
      json: fail
        ? { error: '机器信息暂时不可用' }
        : {
            hostname: 'learning-server',
            operatingSystem: 'Linux 6.1',
            architecture: 'arm64',
            cpu: { model: '测试处理器', logicalCores: 8 },
            memory: { totalBytes, freeBytes: 2 * 1024 ** 3 },
            nodeVersion: 'v22.23.2',
            addresses: [
              { name: 'eth0', address: '192.0.2.10', family: 'IPv4' },
              { name: 'eth0', address: '2001:db8:1234:5678:abcd:1234:5678:abcd', family: 'IPv6' },
            ],
          },
    }),
  );
  await page.goto('/settings');
  await page.getByRole('tab', { name: '关于', exact: true }).click();
  const machine = page.getByRole('region', { name: '运行机器' });
  await expect(machine.getByText('learning-server')).toBeVisible();
  await expect(machine.getByText('总计 8 GiB · 空闲 2 GiB')).toBeVisible();
  for (const width of [375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const theme of ['light', 'dark']) {
      await page
        .locator('body')
        .evaluate((body, theme) => body.setAttribute('theme-mode', theme), theme);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await machine.scrollIntoViewIfNeeded();
      const refresh = machine.getByRole('button', { name: '刷新' });
      await refresh.focus();
      await expect(refresh).toBeFocused();
      if (width <= 800) expect((await refresh.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      expect(await machine.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`about-${width}-${theme}.png`) });
    }
  }
  totalBytes = 16 * 1024 ** 3;
  await machine.getByRole('button', { name: '刷新' }).click();
  await expect(machine.getByText('总计 16 GiB · 空闲 2 GiB')).toBeVisible();
  fail = true;
  await machine.getByRole('button', { name: '刷新' }).click();
  await expect(machine.getByRole('alert')).toHaveText('机器信息暂时不可用');
  fail = false;
  await machine.getByRole('button', { name: '重试' }).click();
  await expect(machine.getByRole('alert')).toBeHidden();
  await expect(machine.getByRole('button', { name: '刷新' })).toBeEnabled();
});
