import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test('converted div paragraphs follow reading density without spacing structural containers', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '我的书架' })).toBeVisible();
  const tokenResponse = await page.request.post('/api/settings/openapi-token', {
    headers: { 'X-Learning-Center-Request': '1' },
  });
  const { token } = await tokenResponse.json();
  const upload = await page.request.post('/api/openapi/v1/books?filename=converted.epub', {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/epub+zip' },
    data: await readFile(new URL('../fixtures/reader-converted.epub', import.meta.url)),
  });
  expect(upload.status()).toBe(201);
  const { book } = await upload.json();
  await page.goto(`/books/${book.id}`);
  let frame = page.mainFrame();
  await expect
    .poll(
      async () => {
        for (const candidate of page.frames()) {
          if (
            await candidate
              .locator('.calibre1')
              .count()
              .catch(() => 0)
          ) {
            frame = candidate;
            return true;
          }
        }
        return false;
      },
      { timeout: 30_000 },
    )
    .toBe(true);
  await expect(frame.locator('.calibre1').first()).toBeVisible();
  if (testInfo.project.name === 'mobile-chrome') {
    await page.getByRole('button', { name: /^打开更多功能/ }).click();
  }
  await page.getByRole('button', { name: '打开阅读样式设置', exact: true }).click();
  for (const density of [
    { name: '紧凑', lineHeight: 1.6, paragraphSpacing: 1 },
    { name: '适中', lineHeight: 1.8, paragraphSpacing: 1.25 },
    { name: '舒展', lineHeight: 2, paragraphSpacing: 1.45 },
  ]) {
    await page.locator('label').filter({ hasText: '松紧程度' }).getByRole('combobox').click();
    await page.getByRole('option').filter({ hasText: density.name }).click();
    await expect
      .poll(() =>
        frame
          .locator('.calibre1')
          .first()
          .evaluate((element) => {
            const style = getComputedStyle(element);
            return Number.parseFloat(style.lineHeight) / Number.parseFloat(style.fontSize);
          }),
      )
      .toBeCloseTo(density.lineHeight, 2);
    await expect
      .poll(() =>
        frame
          .locator('.calibre1')
          .first()
          .evaluate((element) => {
            const style = getComputedStyle(element);
            return Number.parseFloat(style.marginBottom) / Number.parseFloat(style.fontSize);
          }),
      )
      .toBeCloseTo(density.paragraphSpacing, 2);
  }
  expect(
    await frame.locator('.body').evaluate((element) => getComputedStyle(element).marginBottom),
  ).toBe('0px');
  expect(
    await frame
      .locator('#table-cell')
      .evaluate((element) => getComputedStyle(element).marginBottom),
  ).toBe('0px');
  expect(
    await frame.locator('#code').evaluate((element) => {
      const style = getComputedStyle(element);
      return Number.parseFloat(style.lineHeight) / Number.parseFloat(style.fontSize);
    }),
  ).toBeCloseTo(1.3, 2);
  await page.reload();
  await expect
    .poll(
      async () => {
        for (const candidate of page.frames()) {
          if (
            await candidate
              .locator('.calibre1')
              .count()
              .catch(() => 0)
          ) {
            frame = candidate;
            return true;
          }
        }
        return false;
      },
      { timeout: 30_000 },
    )
    .toBe(true);
  await expect
    .poll(() =>
      frame
        .locator('.calibre1 span')
        .first()
        .evaluate((element) => {
          const style = getComputedStyle(element);
          return Number.parseFloat(style.lineHeight) / Number.parseFloat(style.fontSize);
        }),
    )
    .toBe(2);
});
