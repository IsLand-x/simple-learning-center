import { expect, test, type Page } from '@playwright/test';
import type { BookItem } from '../../contracts/books';
import { demoBooks } from '../../src/util/fixtures/demo';

const books = demoBooks.map((book, index) => ({
  ...book,
  id: `archive-test-${index}`,
  title: `存档测试：${book.title}`,
}));
const title = books[0].title;

async function persistedBook(page: Page, id = books[0].id): Promise<BookItem> {
  const snapshot = await (await page.request.get('/api/state/library')).json();
  return snapshot.state.books.find((book: BookItem) => book.id === id);
}

async function archiveBook(page: Page, name: string, archived = true) {
  const trigger = page.getByRole('button', { name: `《${name}》的书籍操作`, exact: true });
  // Explicitly finish test-driven scrolling before opening a pointer menu,
  // which must close when its ancestor scrolls.
  await trigger.evaluate(async (element) => {
    element.scrollIntoView({ block: 'center', behavior: 'instant' });
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
  await trigger.click();
  await page.getByRole('menuitem', { name: archived ? /存档$/ : /取消存档$/ }).click();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '我的书架' })).toBeVisible();
  const snapshot = await (await page.request.get('/api/state/library')).json();
  const changedAt = Date.now();
  snapshot.version = 37;
  snapshot.state.books = [
    ...books.map((book) => ({ ...book, updatedAt: changedAt, archiveUpdatedAt: changedAt })),
    ...snapshot.state.books
      .filter((book: BookItem) => !book.id.startsWith('archive-test-'))
      .map((book: BookItem) => {
        const { archivedAt: _archivedAt, ...rest } = book;
        return { ...rest, archiveUpdatedAt: Math.max(changedAt, (book.archiveUpdatedAt ?? 0) + 1) };
      }),
  ];
  snapshot.state.bookLists = [
    {
      id: 'archive-reading-list',
      name: '长期阅读',
      note: '',
      bookIds: [books[0].id],
      createdAt: changedAt,
      updatedAt: changedAt,
    },
  ];
  expect((await page.request.put('/api/state/library', { data: snapshot })).status()).toBe(204);
  await page.reload();
});

test.afterEach(async ({ page }) => {
  // The suite shares a temporary service; leave its books active for other specs.
  await page.goto('about:blank');
  const snapshot = await (await page.request.get('/api/state/library')).json();
  snapshot.state.books = snapshot.state.books.map((book: BookItem) => {
    const { archivedAt: _archivedAt, ...rest } = book;
    return { ...rest, archiveUpdatedAt: Math.max(Date.now(), (book.archiveUpdatedAt ?? 0) + 1) };
  });
  expect((await page.request.put('/api/state/library', { data: snapshot })).status()).toBe(204);
});

test('存档长期保留书籍与书单，可展开阅读、刷新保留并取消存档', async ({ page }) => {
  const before = await persistedBook(page);
  await archiveBook(page, title);
  const archive = page.getByRole('region', { name: '已存档 · 1 本书' });
  await expect(archive).toBeVisible();
  await expect(page.getByRole('button', { name: `打开《${title}》`, exact: false })).toHaveCount(0);
  const expand = archive.getByRole('button', { name: '展开存档书籍' });
  await expect(expand).toHaveAttribute('aria-expanded', 'false');
  await expand.focus();
  await page.keyboard.press('Enter');
  await expect(archive.locator('.book-card')).toHaveCount(1);
  await expect(archive).toContainText('长期阅读');
  await expect.poll(async () => (await persistedBook(page)).archivedAt ?? 0).toBeGreaterThan(0);
  const saved = await persistedBook(page);
  expect(saved.progress).toBe(before.progress);
  expect(saved.updatedAt).toBe(before.updatedAt);
  await page.reload();
  await expect(archive.getByRole('button', { name: '展开存档书籍' })).toBeVisible();
  await archive.getByRole('button', { name: '展开存档书籍' }).click();
  await archive.getByRole('button', { name: /^打开《/ }).click();
  await expect(page).toHaveURL(`/books/${books[0].id}`);
  await expect(page.locator('.reader-header__title')).toContainText(title);
  await page.goto('/');
  await archive.getByRole('button', { name: '展开存档书籍' }).click();
  await archiveBook(page, title, false);
  await expect(archive).toHaveCount(0);
  await expect(page.getByRole('button', { name: `打开《${title}》`, exact: false })).toBeVisible();
  await expect.poll(async () => (await persistedBook(page)).archivedAt ?? null).toBeNull();
  await page.reload();
  await expect(page.locator('.library-archive')).toHaveCount(0);
});

test('存档不受置顶影响，搜索与筛选能发现存档，全书存档也能访问', async ({ page }) => {
  await page.getByRole('button', { name: `《${title}》的书籍操作`, exact: true }).click();
  await page.getByRole('menuitem', { name: /置顶$/ }).click();
  await archiveBook(page, title);
  await expect(page.getByRole('region', { name: '置顶书籍' })).toHaveCount(0);
  const search = page.getByRole('textbox', { name: '搜索书名或作者' });
  await search.fill(title);
  await expect(page.locator('.library-archive .book-card')).toHaveCount(1);
  await expect(page.locator('.library-archive')).toContainText('符合筛选 1 本');
  await search.fill('没有这本书');
  await expect(page.locator('.library-archive')).toContainText('没有符合筛选的存档书籍');
  await search.clear();
  await page.getByRole('button', { name: '展开存档书籍' }).click();
  await archiveBook(page, title, false);
  await expect(page.getByRole('region', { name: '置顶书籍' })).toContainText(title);
  const snapshot = await (await page.request.get('/api/state/library')).json();
  snapshot.state.books = snapshot.state.books.map((book: BookItem) => ({
    ...book,
    archivedAt: Date.now(),
    archiveUpdatedAt: Date.now() + 10,
  }));
  expect((await page.request.put('/api/state/library', { data: snapshot })).status()).toBe(204);
  await page.reload();
  await expect(page.locator('.library-shelf > section')).toHaveCount(1);
  await expect(page.getByText('没有找到书籍', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '展开存档书籍' }).click();
  await expect(page.locator('.library-archive .book-card')).toHaveCount(
    snapshot.state.books.length,
  );
});

test('存档区域在浅深主题及四种宽度下保持原书卡样式、焦点与无溢出', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chrome');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await archiveBook(page, title);
  await page.getByRole('button', { name: '展开存档书籍' }).click();
  for (const theme of ['light', 'dark']) {
    await page.setViewportSize({ width: 1024, height: 1000 });
    if ((await page.locator('body').getAttribute('theme-mode')) !== theme) {
      await page.getByRole('button', { name: /切换为[深浅]色主题/ }).click();
    }
    for (const width of [375, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      const archive = page.locator('.library-archive');
      await archive.scrollIntoViewIfNeeded();
      const toggle = archive.getByRole('button', { name: '收起存档书籍' });
      await page.keyboard.press('Tab');
      await toggle.focus();
      await expect(toggle).toBeFocused();
      await expect(toggle).toHaveCSS('outline-style', 'solid');
      const hitArea = await toggle.evaluate((element) => ({
        width: element.getBoundingClientRect().width,
        height: parseFloat(getComputedStyle(element, '::after').height),
      }));
      expect(hitArea.width).toBeGreaterThanOrEqual(44);
      expect(hitArea.height).toBeGreaterThanOrEqual(44);
      const dimensions = await page.evaluate(() => ({
        width: document.documentElement.clientWidth,
        scroll: document.documentElement.scrollWidth,
      }));
      expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.width);
      const archiveCard = archive.locator('.book-card');
      const ordinaryCard = page
        .locator('.library-shelf > .library-book-section:not(.library-archive) .book-card')
        .first();
      for (const property of [
        'background-color',
        'padding',
        'grid-template-columns',
        'border-radius',
      ]) {
        const value = await ordinaryCard.evaluate(
          (element, key) => getComputedStyle(element).getPropertyValue(key),
          property,
        );
        await expect(archiveCard).toHaveCSS(property, value);
      }
      await page.screenshot({
        path: testInfo.outputPath(`archive-${theme}-${width}.png`),
        animations: 'disabled',
      });
    }
  }
});
