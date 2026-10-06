import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import type { View } from 'foliate-js/view.js';

async function selectTerm(page: Page, mobile: boolean) {
  const point = await page.locator('foliate-view').evaluate((element) => {
    const view = element as View;
    const { doc } = view.renderer.getContents()[0];
    const paragraph = [...doc.querySelectorAll('p')].find((item) =>
      item.textContent?.includes('概念'),
    )!;
    const node = paragraph.firstChild!;
    const start = node.textContent!.indexOf('概念');
    const range = doc.createRange();
    range.setStart(node, start);
    range.setEnd(node, start + 2);
    const rect = range.getBoundingClientRect();
    const frameRect = doc.defaultView!.frameElement!.getBoundingClientRect();
    if (window.innerWidth <= 800)
      return {
        x: frameRect.left + rect.left + rect.width / 2,
        y: frameRect.top + rect.top + rect.height / 2,
      };
    const selection = doc.defaultView!.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    doc.dispatchEvent(new Event('selectionchange', { bubbles: true }));
    return undefined;
  });
  if (mobile && point) {
    const session = await page.context().newCDPSession(page);
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
    await expect(page.getByRole('toolbar', { name: '文本选择操作' })).toBeVisible();
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await session.detach();
  }
}
async function markedCount(page: Page) {
  return page.locator('foliate-view').evaluate((element) => {
    const view = element as View;
    return view.renderer
      .getContents()
      .reduce(
        (count, { overlayer }) =>
          count +
          ((overlayer as unknown as { element: Element }).element?.querySelectorAll(
            '.reader-term path',
          ).length ?? 0),
        0,
      );
  });
}
async function closePanel(page: Page, mobile: boolean) {
  if (mobile) await page.evaluate(() => window.history.back());
  else await page.getByRole('button', { name: '收起术语表', exact: true }).click();
  await expect(page.getByRole('complementary', { name: '术语表', exact: true })).toBeHidden();
}
async function openPanel(page: Page, mobile: boolean) {
  if (mobile) {
    await page.getByRole('button', { name: '打开更多功能，默认显示 AI 助手' }).click();
    await page
      .getByRole('navigation', { name: '切换更多功能' })
      .getByRole('button', { name: '打开术语表', exact: true })
      .click();
  } else await page.getByRole('button', { name: '打开术语表', exact: true }).click();
}

test('术语跨页与跨章节波浪线、手动释义、出处定位与取消', async ({ page }, testInfo) => {
  const mobile = testInfo.project.name === 'mobile-chrome';
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '我的书架' })).toBeVisible();
  const { token } = await (
    await page.request.post('/api/settings/openapi-token', {
      headers: { 'X-Learning-Center-Request': '1' },
    })
  ).json();
  const response = await page.request.post('/api/openapi/v1/books?filename=glossary.epub', {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/epub+zip' },
    data: await readFile(new URL('../fixtures/reader-regression.epub', import.meta.url)),
  });
  expect(response.status()).toBe(201);
  const { book } = await response.json();
  await page.goto(`/books/${book.id}`);
  await expect(page.locator('foliate-view')).toBeVisible();
  await expect(page.getByText('正在打开 EPUB…', { exact: true })).toBeHidden();
  await selectTerm(page, mobile);
  await page.getByRole('button', { name: '添加到术语表', exact: true }).click();
  const panel = page.getByRole('complementary', { name: '术语表', exact: true });
  await expect(panel).toBeVisible();
  await expect.poll(() => markedCount(page)).toBeGreaterThan(1);
  await panel.getByRole('button', { name: '编辑 概念 的释义', exact: true }).click();
  await panel.getByRole('textbox', { name: '术语释义' }).fill('思考与表达中抽象出的共同特征。');
  await panel.getByRole('button', { name: '保存', exact: true }).click();
  await expect(panel.getByText('思考与表达中抽象出的共同特征。')).toBeVisible();
  const snapshot = await (await page.request.get('/api/state/highlights')).json();
  const term = snapshot.state.highlights.find(
    (item: { kind?: string; bookId: string }) => item.kind === 'term' && item.bookId === book.id,
  );
  expect(term.cfi).toMatch(/^epubcfi\(/);
  await closePanel(page, mobile);
  await page.getByRole('button', { name: '下一页', exact: true }).click();
  await expect.poll(() => markedCount(page)).toBeGreaterThan(1);
  if (mobile) await page.getByRole('button', { name: '打开书籍目录', exact: true }).click();
  const toc = mobile
    ? page.getByRole('dialog').getByRole('navigation', { name: '书籍目录' })
    : page.getByRole('navigation', { name: '书籍目录' });
  await toc.getByRole('button', { name: '第二章', exact: true }).click();
  await expect
    .poll(() =>
      page
        .locator('foliate-view')
        .evaluate(
          (element) =>
            (element as View).renderer.getContents()[0].doc.querySelector('h1')?.textContent,
        ),
    )
    .toBe('第二章');
  await expect.poll(() => markedCount(page)).toBeGreaterThan(1);
  await openPanel(page, mobile);
  await panel.getByRole('button', { name: '概念', exact: true }).click();
  await expect
    .poll(() =>
      page
        .locator('foliate-view')
        .evaluate(
          (element) =>
            (element as View).renderer.getContents()[0].doc.querySelector('h1')?.textContent,
        ),
    )
    .toBe('第一章');
  if (mobile) {
    await expect(panel).toBeHidden();
    await expect
      .poll(() => page.evaluate(() => Boolean(window.history.state?.learningCenterMobileOverlay)))
      .toBe(false);
    await expect(page).toHaveURL(new RegExp(`/books/${book.id}$`));
  } else await closePanel(page, mobile);
  await page.reload();
  await expect(page.getByText('正在打开 EPUB…', { exact: true })).toBeHidden();
  await expect.poll(() => markedCount(page)).toBeGreaterThan(1);
  await selectTerm(page, mobile);
  await page.getByRole('button', { name: '取消术语高亮', exact: true }).click();
  await expect.poll(() => markedCount(page)).toBe(0);
  await openPanel(page, mobile);
  await expect(panel.getByText('还没有术语', { exact: true })).toBeVisible();
});

test('术语侧栏浅深色与四档宽度保持紧凑，无溢出，键盘可编辑', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chrome');
  test.setTimeout(120_000);
  const { demoBooks } = await import('../../src/util/fixtures/demo');
  const book = demoBooks[0];
  const text = '用于验证长术语标题省略与释义换行的概念'.repeat(3);
  for (const theme of ['light', 'dark']) {
    for (const width of [375, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      await expect(page.getByRole('heading', { name: '我的书架' })).toBeVisible();
      for (const [domain, changes] of Object.entries({
        library: { books: [book] },
        preferences: { themeMode: theme },
        highlights: {
          highlights: [
            {
              id: 'visual-term',
              bookId: book.id,
              kind: 'term',
              text,
              cfi: 'demo:chapter-1:selection:1',
              chapter: '第一章',
              definition: '这是一段简短释义。长文本与术语编辑保持在面板宽度以内。',
              createdAt: Date.now(),
              updatedAt: Date.now(),
            },
          ],
        },
      })) {
        const snapshot = await (await page.request.get(`/api/state/${domain}`)).json();
        Object.assign(snapshot.state, changes);
        snapshot.version = 38;
        expect((await page.request.put(`/api/state/${domain}`, { data: snapshot })).status()).toBe(
          204,
        );
      }
      await page.goto(`/books/${book.id}`);
      await openPanel(page, width <= 800);
      const panel = page.getByRole('complementary', { name: '术语表', exact: true });
      await expect(panel).toBeVisible();
      expect(await panel.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
        true,
      );
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      const title = panel.locator('.glossary-term__title');
      await page.keyboard.press('Tab');
      await title.focus();
      expect(await title.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe(
        'none',
      );
      await page.screenshot({ path: testInfo.outputPath(`glossary-${theme}-${width}.png`) });
      await panel.getByRole('button', { name: `编辑 ${text} 的释义`, exact: true }).click();
      const input = panel.getByRole('textbox', { name: '术语释义' });
      await input.fill('手动释义');
      if (width <= 800)
        expect(await input.evaluate((element) => getComputedStyle(element).fontSize)).toBe('16px');
      await input.press('Control+Enter');
      await expect(panel.getByText('手动释义', { exact: true })).toBeVisible();
      await closePanel(page, width <= 800);
    }
  }
});
