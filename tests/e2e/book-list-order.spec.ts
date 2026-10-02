import { expect, test, type Page } from '@playwright/test';
import { demoBooks } from '../../src/util/fixtures/demo';

const listNames = ['阅读计划', '技术与设计', '一个用于检查窄屏省略的很长很长的书单名称'];

async function openLists(page: Page) {
  await page.goto('/');
  await page
    .getByRole('group', { name: '切换书架与书单' })
    .getByRole('button', { name: /书单$/ })
    .click();
  await expect(page.locator('.book-list-nav__select')).toHaveCount(3);
}

async function savedOrder(page: Page) {
  const response = await page.request.get('/api/state/library');
  return (await response.json()).state.bookLists.map((list: { name: string }) => list.name);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '我的书架' })).toBeVisible();
  const response = await page.request.get('/api/state/library');
  const library = await response.json();
  library.state.books = demoBooks;
  library.state.bookLists = listNames.map((name, index) => ({
    id: `order-list-${index}`,
    name,
    note: `书单备注 ${index}`,
    bookIds: index === 0 ? demoBooks.slice(0, 2).map((book) => book.id) : [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }));
  expect((await page.request.put('/api/state/library', { data: library })).status()).toBe(204);
  await openLists(page);
});

test('keyboard sorting preserves the selected list, saves order and supports cancellation', async ({
  page,
}, testInfo) => {
  const isMobile = testInfo.project.name === 'mobile-chrome';
  const handle = page.getByRole('button', { name: `拖动书单“${listNames[0]}”调整排序` });
  await handle.focus();
  await page.keyboard.press('Space');
  await expect(page.locator('.book-list-nav__item--dragging')).toHaveCount(1);
  await page.keyboard.press(isMobile ? 'ArrowRight' : 'ArrowDown');
  await page.keyboard.press('Space');
  await expect(page.locator('.book-list-nav__item--dragging')).toHaveCount(0);
  await expect(page.locator('.book-list-nav__select > span:first-child')).toHaveText([
    listNames[1],
    listNames[0],
    listNames[2],
  ]);
  await expect(page.locator('.book-list-nav__select[aria-current]')).toContainText(listNames[0]);
  await expect(page.locator('.book-list-detail__identity')).toContainText('书单备注 0');
  await expect.poll(() => savedOrder(page)).toEqual([listNames[1], listNames[0], listNames[2]]);

  await handle.focus();
  await page.keyboard.press('Space');
  await page.keyboard.press(isMobile ? 'ArrowLeft' : 'ArrowUp');
  await page.keyboard.press('Escape');
  await expect(page.locator('.book-list-nav__item--dragging')).toHaveCount(0);
  await expect.poll(() => savedOrder(page)).toEqual([listNames[1], listNames[0], listNames[2]]);

  await openLists(page);
  await expect(page.locator('.book-list-nav__select > span:first-child')).toHaveText([
    listNames[1],
    listNames[0],
    listNames[2],
  ]);
  await page.locator('.book-list-nav__select').nth(1).click();
  const bookHandle = page.getByRole('button', {
    name: `拖动《${demoBooks[0].title}》调整排序`,
  });
  await bookHandle.focus();
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Space');
  await expect(page.locator('.book-list-book__copy').first()).toContainText(demoBooks[1].title);
});

test('pointer dragging sorts lists using mouse or a long touch', async ({ page }, testInfo) => {
  const isMobile = testInfo.project.name === 'mobile-chrome';
  const handle = page.getByRole('button', { name: `拖动书单“${listNames[0]}”调整排序` });
  const source = (await handle.boundingBox())!;
  const target = (await page.locator('.book-list-nav__item').nth(1).boundingBox())!;
  const start = { x: source.x + source.width / 2, y: source.y + source.height / 2 };
  const end = isMobile
    ? { x: start.x + target.width + 2, y: start.y }
    : { x: start.x, y: start.y + target.height + 2 };
  if (isMobile) {
    const session = await page.context().newCDPSession(page);
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
    await expect(page.locator('.book-list-nav__item--dragging')).toHaveCount(1);
    for (let step = 1; step <= 10; step++) {
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: start.x + ((end.x - start.x) * step) / 10, y: start.y }],
      });
    }
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await session.detach();
  } else {
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x, start.y + 8, { steps: 3 });
    await expect(page.locator('.book-list-nav__item--dragging')).toHaveCount(1);
    await page.mouse.move(end.x, end.y, { steps: 10 });
    await page.mouse.up();
  }
  await expect.poll(() => savedOrder(page)).toEqual([listNames[1], listNames[0], listNames[2]]);
});

test('list handles and long labels fit both themes at representative widths', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chrome');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const theme of ['light', 'dark']) {
    await page.setViewportSize({ width: 1024, height: 900 });
    if ((await page.locator('body').getAttribute('theme-mode')) !== theme) {
      await page.getByRole('button', { name: /切换为[深浅]色主题/ }).click();
    }
    for (const width of [375, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const handle = page.locator('.book-list-nav__handle').first();
      await page.keyboard.press('Tab');
      await handle.focus();
      await expect(handle).toBeFocused();
      await expect(handle).toHaveCSS('outline-style', 'solid');
      const bounds = (await handle.boundingBox())!;
      if (width <= 800) {
        expect(bounds.width).toBeGreaterThanOrEqual(44);
        expect(bounds.height).toBeGreaterThanOrEqual(44);
      }
      const dimensions = await page.evaluate(() => ({
        width: document.documentElement.clientWidth,
        scroll: document.documentElement.scrollWidth,
      }));
      expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.width);
      await expect(page.locator('.book-list-nav__select > span:first-child').last()).toHaveCSS(
        'text-overflow',
        'ellipsis',
      );
      await page.screenshot({ path: testInfo.outputPath(`book-lists-${theme}-${width}.png`) });
    }
  }
});
