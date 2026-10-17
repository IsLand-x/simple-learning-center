import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test('CDN 构建保持动态分包、同源 Service Worker 和离线页面可用', async ({
  page,
  context,
  request,
  baseURL,
}) => {
  test.setTimeout(120_000);
  const html = await (await request.get('/')).text();
  const scriptUrl = html.match(/<script[^>]+src="(https:\/\/[^"\s]+\/assets\/[^"\s]+\.js)"/)?.[1];
  test.skip(!scriptUrl, '仅对启用静态 CDN 的生产构建执行');
  const assetOrigin = new URL(scriptUrl!).origin;
  let cdnRequests = 0;
  // Exercise real cross-origin URLs without depending on deployed assets or external DNS.
  await context.route(`${assetOrigin}/**`, async (route) => {
    const url = new URL(route.request().url());
    expect(url.pathname).toMatch(/^\/assets\//);
    const response = await request.get(`${baseURL}${url.pathname}${url.search}`, {
      headers: { 'Accept-Encoding': 'identity' },
    });
    expect(response.status()).toBe(200);
    expect(response.headers()['access-control-allow-origin']).toBe('*');
    cdnRequests += 1;
    await route.fulfill({ response });
  });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  expect(errors).toEqual([]);
  await expect(page.getByRole('heading', { name: '我的书架' })).toBeVisible({ timeout: 30_000 });
  expect(cdnRequests).toBeGreaterThan(0);
  const tokenResponse = await request.post('/api/settings/openapi-token', {
    headers: { 'X-Learning-Center-Request': '1' },
  });
  const { token } = await tokenResponse.json();
  const upload = await request.post('/api/openapi/v1/books?filename=cdn-reader.epub', {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/epub+zip' },
    data: await readFile(new URL('../fixtures/reader-typography.epub', import.meta.url)),
  });
  expect(upload.status()).toBe(201);
  const { book } = await upload.json();
  await page.goto(`/books/${book.id}`);
  await expect
    .poll(
      async () => {
        for (const frame of page.frames()) {
          if (frame === page.mainFrame()) continue;
          if (await frame.locator('h2, h4').count()) return true;
        }
        return false;
      },
      { timeout: 30_000 },
    )
    .toBe(true);
  await page.goto('/settings');
  await expect(page.locator('.app-shell')).toBeVisible();
  const workerUrl = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    return registration.active?.scriptURL;
  });
  expect(workerUrl).toBe(`${baseURL}/sw.js`);
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('#root')).toContainText('无法连接学习中心服务');
  expect(errors).toEqual([]);
});
