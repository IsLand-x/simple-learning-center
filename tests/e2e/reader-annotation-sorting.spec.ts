import { expect, test, type Page } from '@playwright/test';
import type { HighlightItem } from '../../contracts/reading';
import { prepareWorkspace } from './workspace-fixtures';

const panels = ['术语表', '高亮', '评论'] as const;
const fixtureTime = Date.parse('2026-09-26T04:00:00.000Z');
const bookId = 'demo-data-intensive';

async function openPanel(page: Page, label: string, mobile: boolean) {
  if (mobile) {
    const tabs = page.getByRole('navigation', { name: '切换更多功能' });
    if (!(await tabs.isVisible()))
      await page.getByRole('button', { name: '打开更多功能，默认显示 AI 助手' }).click();
    await tabs.getByRole('button', { name: `打开${label}`, exact: true }).click();
  } else await page.getByRole('button', { name: `打开${label}`, exact: true }).click();
  return page.getByRole('complementary', { name: label, exact: true });
}

async function seedAnnotations(page: Page) {
  const response = await page.request.get('/api/state/highlights');
  const snapshot = await response.json();
  const highlights: HighlightItem[] = [];
  for (const kind of ['term', 'highlight', 'comment'] as const) {
    for (const [index, cfi] of [
      'epubcfi(/6/2!/4/2/1:10)',
      'epubcfi(/6/10!/4/2/1:0)',
      'epubcfi(/6/2!/4/2/1:2)',
    ].entries()) {
      highlights.push({
        id: crypto.randomUUID(),
        bookId,
        kind,
        text: `${kind}-${index}`,
        cfi,
        chapter: '第一章',
        ...(kind === 'comment' ? { comment: `评论 ${index}` } : {}),
        createdAt: fixtureTime + index,
        // Editing the first record must not move it to the top.
        updatedAt: fixtureTime + 100 - index,
        ...(kind === 'comment' ? { commentUpdatedAt: fixtureTime + 100 - index } : {}),
      });
    }
  }
  snapshot.state.highlights = highlights;
  expect((await page.request.put('/api/state/highlights', { data: snapshot })).status()).toBe(204);
}

test('三个侧栏默认最新在上，可分别切换时间与书籍位置排序，刷新恢复默认', async ({
  page,
}, testInfo) => {
  test.setTimeout(60_000);
  const mobile = testInfo.project.name === 'mobile-chrome';
  await prepareWorkspace(page);
  await seedAnnotations(page);
  await page.goto(`/books/${bookId}`);
  for (const label of panels) {
    const panel = await openPanel(page, label, mobile);
    const kind = label === '术语表' ? 'term' : label === '高亮' ? 'highlight' : 'comment';
    const titles = panel.locator(
      label === '术语表'
        ? '.glossary-term__title'
        : label === '高亮'
          ? '.highlight-card > p'
          : '.comment-card > blockquote',
    );
    const sort = panel.getByRole('combobox', { name: `${label}排序`, exact: true });
    await expect(sort).toContainText('添加时间倒序');
    await expect(titles).toHaveText([`${kind}-2`, `${kind}-1`, `${kind}-0`]);
    await sort.click();
    await page.getByRole('option', { name: /添加时间正序$/ }).click();
    await expect(titles).toHaveText([`${kind}-0`, `${kind}-1`, `${kind}-2`]);
    await sort.click();
    await page.getByRole('option', { name: /书籍位置$/ }).click();
    await expect(titles).toHaveText([`${kind}-2`, `${kind}-0`, `${kind}-1`]);
  }
  const glossary = await openPanel(page, '术语表', mobile);
  await expect(glossary.getByRole('combobox', { name: '术语表排序', exact: true })).toContainText(
    '书籍位置',
  );
  if (mobile) {
    await glossary.getByRole('combobox', { name: '术语表排序', exact: true }).click();
    await expect(page.getByRole('option', { name: /添加时间正序$/ })).toBeVisible();
    await page.evaluate(() => window.history.back());
    await expect(page.getByRole('option', { name: /添加时间正序$/ })).toBeHidden();
    await expect(glossary).toBeVisible();
    await page.evaluate(() => window.history.back());
    await expect(glossary).toBeHidden();
    await expect(page).toHaveURL(new RegExp(`/books/${bookId}$`));
  }
  await page.reload();
  const reopened = await openPanel(page, '术语表', mobile);
  await expect(reopened.getByRole('combobox', { name: '术语表排序', exact: true })).toContainText(
    '添加时间倒序',
  );
});

for (const theme of ['light', 'dark']) {
  for (const width of [375, 768, 1024, 1440]) {
    test(`排序标题栏空状态与键盘选择：${theme}-${width}`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'desktop-chrome');
      test.setTimeout(60_000);
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await prepareWorkspace(page, { theme });
      await page.goto(`/books/${bookId}`);
      for (const label of panels) {
        const panel = await openPanel(page, label, width <= 800);
        const sort = panel.getByRole('combobox', { name: `${label}排序`, exact: true });
        await expect(
          panel.getByText(`还没有${label === '术语表' ? '术语' : label}`, { exact: true }),
        ).toBeVisible();
        const titlebar = panel.locator('.panel-titlebar');
        const bounds = await sort.boundingBox();
        const bar = await titlebar.boundingBox();
        expect(bounds!.x).toBeGreaterThan(bar!.x);
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(bar!.x + bar!.width);
        if (width <= 800) expect(bounds!.height).toBeGreaterThanOrEqual(44);
        expect(await panel.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
          true,
        );
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
        await sort.focus();
        await page.keyboard.press('Enter');
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Enter');
        await expect(sort).toContainText('添加时间正序');
        await page.screenshot({
          path: testInfo.outputPath(`sorting-${label}-${theme}-${width}.png`),
        });
      }
      if (width <= 800) await page.evaluate(() => window.history.back());
    });
  }
}
