import { readFile } from 'node:fs/promises';
import { expect, test, type Frame, type Page } from '@playwright/test';
import { prepareWorkspace } from './workspace-fixtures';

test.use({ locale: 'zh-CN', reducedMotion: 'reduce', serviceWorkers: 'block' });

async function frameForBook(page: Page): Promise<Frame> {
  let frame: Frame | undefined;
  await expect
    .poll(
      async () => {
        for (const candidate of page.frames()) {
          if (await candidate.locator('p.authored').count()) {
            frame = candidate;
            return true;
          }
        }
        return false;
      },
      { timeout: 30_000 },
    )
    .toBe(true);
  return frame!;
}

async function openSettings(page: Page, mobile: boolean) {
  if (mobile) await page.getByRole('button', { name: /^打开更多功能/ }).click();
  await page.getByRole('button', { name: '打开阅读样式设置', exact: true }).click();
  await expect(page.getByLabel('正文排版', { exact: true })).toBeVisible();
}

test('真实 EPUB 支持宋体与黑体纸书排版，配色独立，刷新后保留设置', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await page.route('https://cdn.jsdelivr.net/**', (route) => route.abort());
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '我的书架' })).toBeVisible({ timeout: 20_000 });
  const tokenResponse = await page.request.post('/api/settings/openapi-token', {
    headers: { 'X-Learning-Center-Request': '1' },
  });
  const { token } = await tokenResponse.json();
  const upload = await page.request.post('/api/openapi/v1/books?filename=book-layout.epub', {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/epub+zip' },
    data: await readFile(new URL('../fixtures/reader-typography.epub', import.meta.url)),
  });
  expect(upload.status()).toBe(201);
  const { book } = await upload.json();
  await page.goto(`/books/${book.id}`);
  let frame = await frameForBook(page);
  const cursor = await frame
    .locator('p.authored')
    .evaluate((element) => getComputedStyle(element).cursor);
  if (testInfo.project.name === 'desktop-chrome') {
    expect(cursor).toContain('data:image/svg+xml');
    expect(cursor).toContain('16 16');
  }
  // Published EPUBs often use fixed sizes on paragraphs and nested spans.
  await frame
    .locator('p')
    .first()
    .evaluate((element) => {
      element.style.fontSize = '12px';
      const span = element.ownerDocument.createElement('span');
      span.style.fontSize = '10px';
      span.textContent = '内嵌字号也应遵循正文设置。';
      element.appendChild(span);
    });
  await openSettings(page, testInfo.project.name === 'mobile-chrome');
  await page.getByRole('button', { name: '纸书宋体', exact: true }).click();
  await expect(frame.locator('body')).toHaveCSS('font-size', '20px');
  await expect(frame.locator('p').first()).toHaveCSS('text-indent', '40px');
  await expect(frame.locator('p').first()).toHaveCSS('margin-bottom', '0px');
  await expect(frame.locator('p').first()).toHaveCSS('text-align', 'justify');
  await expect(frame.locator('p').first().locator('span')).toHaveCSS('font-size', '20px');
  await expect(frame.locator('p.authored')).toHaveCSS('text-align', 'center');
  await expect(frame.locator('p.authored')).toHaveCSS('text-align-last', 'auto');
  const input = page.getByRole('spinbutton', { name: '正文字号', exact: true });
  await input.fill('22');
  await input.press('Tab');
  await expect(frame.locator('p').first()).toHaveCSS('font-size', '22px');
  await page.getByRole('button', { name: /燕麦暖纸/ }).click();
  await expect(frame.locator('body')).toHaveCSS('font-size', '22px');
  await expect(frame.locator('body')).toHaveCSS('font-family', /Noto Serif/);
  await expect(frame.locator('html')).toHaveCSS('background-color', 'rgb(238, 230, 216)');
  await page.getByRole('button', { name: '清晰黑体', exact: true }).click();
  await expect(frame.locator('body')).toHaveCSS('font-family', /Noto Sans/);
  await expect(frame.locator('body')).toHaveCSS('font-size', '20px');
  await expect(frame.locator('html')).toHaveCSS('background-color', 'rgb(238, 230, 216)');
  await page.getByRole('combobox', { name: '段落样式', exact: true }).click();
  await page.getByRole('option').filter({ hasText: '段落留白' }).click();
  await expect(frame.locator('p').first()).toHaveCSS('margin-bottom', '25px');
  await expect
    .poll(async () => {
      const snapshot = await (await page.request.get('/api/state/preferences')).json();
      return snapshot.state.readerPreferences;
    })
    .toMatchObject({ theme: 'oat', fontFamily: 'sans', fontSize: 20, paragraphStyle: 'spaced' });
  await page.reload();
  frame = await frameForBook(page);
  await expect(frame.locator('body')).toHaveCSS('font-family', /Noto Sans/);
  await expect(frame.locator('p').first()).toHaveCSS('margin-bottom', '25px');
  await expect(frame.locator('html')).toHaveCSS('background-color', 'rgb(238, 230, 216)');
});

for (const width of [375, 768, 1024, 1440]) {
  for (const theme of ['light', 'dark']) {
    test(`阅读样式控件 ${theme} ${width}`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'desktop-chrome');
      test.setTimeout(60_000);
      await page.setViewportSize({ width, height: 900 });
      await prepareWorkspace(page, { theme, visualOnly: true, fixedTime: false });
      await page.goto('/books/demo-data-intensive');
      await expect(page.locator('.demo-reader article')).toBeVisible();
      await openSettings(page, width <= 800);
      const panel = page.locator('.reader-style-panel:visible');
      await page.getByRole('button', { name: '纸书宋体', exact: true }).click();
      await expect(page.locator('.demo-reader article')).toHaveCSS('font-size', '20px');
      await page.getByRole('button', { name: '清晰黑体', exact: true }).click();
      await expect(page.locator('.demo-reader article')).toHaveCSS('font-family', /Noto Sans/);
      await page.getByRole('button', { name: '纸书宋体', exact: true }).focus();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('button', { name: '纸书宋体', exact: true })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      expect(await panel.locator('.reader-style-preset').count()).toBe(20);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({
        path: testInfo.outputPath(`typography-controls-${theme}-${width}.png`),
      });
      await page.getByRole('button', { name: /暖墨夜读/ }).click();
      await expect(page.locator('.demo-reader')).toHaveCSS('background-color', 'rgb(44, 37, 40)');
      await expect(page.locator('.demo-reader article')).toHaveCSS('font-size', '20px');
      await expect(page.locator('body')).toHaveAttribute('theme-mode', theme);
      await panel.evaluate((element) => {
        element.scrollTop = 0;
      });
      await page.getByRole('combobox', { name: '字体', exact: true }).click();
      await page.getByRole('option').filter({ hasText: '思源黑体' }).click();
      await expect(page.locator('.demo-reader article')).toHaveCSS('font-family', /Noto Sans/);
    });
  }
}
