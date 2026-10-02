import { readFile } from 'node:fs/promises';
import { expect, test, type Frame, type Page } from '@playwright/test';

interface StoredBook {
  id: string;
  currentCfi?: string;
  currentChapter: string;
  progress: number;
}

async function storedBook(page: Page, bookId: string): Promise<StoredBook> {
  const response = await page.request.get('/api/state/library');
  const snapshot = await response.json();
  return snapshot.state.books.find((book: StoredBook) => book.id === bookId);
}

async function chapterFrame(page: Page, chapter: string): Promise<Frame> {
  let matchingFrame: Frame | undefined;
  // Foliate owns closed shadow roots, so inspect attached browser frames instead of DOM piercing.
  await expect
    .poll(
      async () => {
        for (const frame of page.frames().filter((candidate) => candidate !== page.mainFrame())) {
          if (await frame.getByRole('heading', { name: chapter, exact: true }).count()) {
            matchingFrame = frame;
            return true;
          }
        }
        return false;
      },
      { timeout: 30_000 },
    )
    .toBe(true);
  return matchingFrame!;
}

test('real EPUB keeps Foliate rendering, navigation and exact CFI after reload', async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '我的书架' })).toBeVisible();
  const tokenResponse = await page.request.post('/api/settings/openapi-token', {
    headers: { 'X-Learning-Center-Request': '1' },
  });
  expect(tokenResponse.ok()).toBe(true);
  const { token } = await tokenResponse.json();
  const upload = await page.request.post('/api/openapi/v1/books?filename=foliate-runtime.epub', {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/epub+zip' },
    data: await readFile(new URL('../fixtures/reader-regression.epub', import.meta.url)),
  });
  expect(upload.status()).toBe(201);
  const { book } = await upload.json();
  await page.goto(`/books/${book.id}`);
  let frame = await chapterFrame(page, '第一章');
  await expect(frame.locator('body')).toBeVisible();
  await expect(page.getByText('正在打开 EPUB…', { exact: true })).toBeHidden();
  await expect(frame.getByRole('heading', { name: '第一章', exact: true })).toBeVisible();
  await expect.poll(async () => (await storedBook(page, book.id)).currentCfi).toMatch(/^epubcfi\(/);

  if (testInfo.project.name === 'mobile-chrome') {
    await page.getByRole('button', { name: '打开书籍目录', exact: true }).click();
  }
  const toc =
    testInfo.project.name === 'mobile-chrome'
      ? page.getByRole('dialog').getByRole('navigation', { name: '书籍目录' })
      : page.getByRole('navigation', { name: '书籍目录' });
  await toc.getByRole('button', { name: '第二章', exact: true }).click();
  await expect.poll(async () => (await storedBook(page, book.id)).currentChapter).toBe('第二章');
  frame = await chapterFrame(page, '第二章');
  await expect(frame.getByRole('heading', { name: '第二章', exact: true })).toBeVisible();
  const chapterStart = await storedBook(page, book.id);
  await page.getByRole('button', { name: '下一页', exact: true }).click();
  await expect
    .poll(async () => (await storedBook(page, book.id)).currentCfi)
    .not.toBe(chapterStart.currentCfi);
  const advanced = await storedBook(page, book.id);
  expect(advanced.progress).toBeGreaterThan(chapterStart.progress);

  await page.reload();
  frame = await chapterFrame(page, '第二章');
  await expect(frame.locator('body')).toBeVisible();
  await expect(page.getByText('正在打开 EPUB…', { exact: true })).toBeHidden();
  await expect
    .poll(async () => (await storedBook(page, book.id)).currentCfi)
    .toBe(advanced.currentCfi);
  await expect
    .poll(() =>
      page
        .locator('foliate-view')
        .evaluate(
          (element) =>
            (element as HTMLElement & { lastLocation?: { cfi?: string } }).lastLocation?.cfi,
        ),
    )
    .toBe(advanced.currentCfi);
  await expect.poll(async () => (await storedBook(page, book.id)).currentChapter).toBe('第二章');
  // Also confirm the renderer restored a position inside the chapter, beyond its heading.
  await expect(frame.getByRole('heading', { name: '第二章', exact: true })).not.toBeInViewport();
  await page.getByRole('button', { name: '上一页', exact: true }).click();
  await expect
    .poll(async () => (await storedBook(page, book.id)).currentCfi)
    .not.toBe(advanced.currentCfi);
});
