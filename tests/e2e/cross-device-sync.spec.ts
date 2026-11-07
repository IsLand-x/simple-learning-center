import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

async function openApiToken(page: Page) {
  const { token } = await (
    await page.request.post('/api/settings/openapi-token', {
      headers: { 'X-Learning-Center-Request': '1' },
    })
  ).json();
  return token as string;
}

async function syncFromForeground(page: Page) {
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
}

test('两台浏览器同步进度和术语，重排不覆盖远端位置', async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chrome');
  test.setTimeout(120_000);
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();
  try {
    await pageA.goto('/');
    await expect(pageA.getByRole('heading', { name: '我的书架' })).toBeVisible();
    const token = await openApiToken(pageA);
    const uploaded = await pageA.request.post('/api/openapi/v1/books?filename=sync.epub', {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/epub+zip' },
      data: await readFile(new URL('../fixtures/reader-regression.epub', import.meta.url)),
    });
    expect(uploaded.status()).toBe(201);
    const { book } = await uploaded.json();
    await pageB.goto('/');
    await expect(pageB.getByRole('heading', { name: '我的书架' })).toBeVisible();
    await pageA.goto(`/books/${book.id}`);
    await expect(pageA.locator('foliate-view')).toBeVisible({ timeout: 30_000 });
    const before = await (await pageA.request.get('/api/state/library')).json();
    const original = before.state.books.find((item: { id: string }) => item.id === book.id);
    await pageA.getByRole('button', { name: '下一页', exact: true }).click();
    await expect
      .poll(async () => {
        const library = await (await pageA.request.get('/api/state/library')).json();
        return library.state.books.find((item: { id: string }) => item.id === book.id)?.currentCfi;
      })
      .not.toBe(original.currentCfi);
    const moved = await (await pageA.request.get('/api/state/library')).json();
    const progress = moved.state.books.find((item: { id: string }) => item.id === book.id);
    await syncFromForeground(pageB);
    await expect
      .poll(async () =>
        pageB
          .getByRole('button', { name: new RegExp(`打开《${book.title}》`) })
          .getAttribute('aria-label'),
      )
      .toContain(`已读 ${progress.progress}%`);

    await pageA.locator('foliate-view').evaluate((element) => {
      const view = element as unknown as {
        renderer: { getContents: () => Array<{ doc: Document }> };
      };
      const { doc } = view.renderer.getContents()[0];
      const paragraph = [...doc.querySelectorAll('p')].find((item) => item.textContent?.trim());
      const node = paragraph?.firstChild;
      if (!node?.textContent) throw new Error('没有可选正文');
      const range = doc.createRange();
      range.setStart(node, 0);
      range.setEnd(node, Math.min(2, node.textContent.length));
      const selection = doc.defaultView?.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      doc.dispatchEvent(new Event('selectionchange', { bubbles: true }));
    });
    await pageA.getByRole('button', { name: '添加到术语表', exact: true }).click();
    await pageB.goto(`/books/${book.id}`);
    await expect(pageB.locator('foliate-view')).toBeVisible({ timeout: 30_000 });
    await pageB.getByRole('button', { name: '打开术语表', exact: true }).click();
    const highlights = await (await pageA.request.get('/api/state/highlights')).json();
    const term = highlights.state.highlights.find(
      (item: { kind?: string; bookId: string }) => item.kind === 'term' && item.bookId === book.id,
    );
    expect(term?.text).toBeTruthy();
    await expect(pageB.getByRole('button', { name: term.text, exact: true })).toBeVisible();
    await pageB.setViewportSize({ width: 900, height: 700 });
    const afterResize = await (await pageB.request.get('/api/state/library')).json();
    const resized = afterResize.state.books.find((item: { id: string }) => item.id === book.id);
    expect(resized.currentCfi).toBe(progress.currentCfi);
    expect(resized.locationUpdatedAt).toBe(progress.locationUpdatedAt);

    await pageB.getByRole('button', { name: '下一页', exact: true }).click();
    await expect
      .poll(async () => {
        const library = await (await pageB.request.get('/api/state/library')).json();
        return library.state.books.find((item: { id: string }) => item.id === book.id)?.currentCfi;
      })
      .not.toBe(progress.currentCfi);
    const fromB = await (await pageB.request.get('/api/state/library')).json();
    const progressB = fromB.state.books.find((item: { id: string }) => item.id === book.id);
    await syncFromForeground(pageA);
    await expect
      .poll(async () => {
        const library = await (await pageA.request.get('/api/state/library')).json();
        return library.state.books.find((item: { id: string }) => item.id === book.id)?.currentCfi;
      })
      .toBe(progressB.currentCfi);
    await expect(pageA.locator('foliate-view')).toBeVisible();

    await pageB.getByRole('button', { name: `编辑 ${term.text} 的释义`, exact: true }).click();
    await pageB.locator(`#term-definition-${term.id}`).fill('双向同步释义');
    await pageB.getByRole('button', { name: '保存', exact: true }).click();
    await syncFromForeground(pageA);
    await expect
      .poll(async () => {
        const body = await (await pageA.request.get('/api/state/highlights')).json();
        return body.state.highlights.find((item: { id: string }) => item.id === term.id)
          ?.definition;
      })
      .toBe('双向同步释义');

    await pageA.goto(`/books/${book.id}`);
    await expect(pageA.locator('foliate-view')).toBeVisible({ timeout: 30_000 });
    await pageA.getByRole('button', { name: '打开术语表', exact: true }).click();
    await pageA.getByRole('button', { name: `删除术语 ${term.text}`, exact: true }).click();
    await syncFromForeground(pageB);
    await expect
      .poll(async () => {
        const body = await (await pageB.request.get('/api/state/highlights')).json();
        return body.state.highlights.some((item: { id: string }) => item.id === term.id);
      })
      .toBe(false);
    await expect(pageB.getByRole('button', { name: term.text, exact: true })).toHaveCount(0);

    const beforeRename = await (await pageA.request.get('/api/state/library')).json();
    const named = beforeRename.state.books.find((item: { id: string }) => item.id === book.id);
    await pageA.getByRole('button', { name: '更多书籍操作', exact: true }).click();
    await pageA.getByRole('menuitem', { name: '重命名书籍' }).click();
    await pageA.getByRole('textbox', { name: '书籍名称' }).fill('改名后的回归书');
    await pageA.getByRole('button', { name: '保存名称', exact: true }).click();
    await expect
      .poll(async () => {
        const library = await (await pageA.request.get('/api/state/library')).json();
        return library.state.books.find((item: { id: string }) => item.id === book.id)?.title;
      })
      .toBe('改名后的回归书');
    const renamed = await (await pageA.request.get('/api/state/library')).json();
    const renamedBook = renamed.state.books.find((item: { id: string }) => item.id === book.id);
    expect(renamedBook.currentCfi).toBe(named.currentCfi);
    expect(renamedBook.locationUpdatedAt).toBe(named.locationUpdatedAt);

    await pageB.reload();
    await expect(
      pageB.getByRole('heading', { name: '我的书架' }).or(pageB.locator('foliate-view')),
    ).toBeVisible();
    const afterReload = await (await pageB.request.get('/api/state/library')).json();
    const reloaded = afterReload.state.books.find((item: { id: string }) => item.id === book.id);
    expect(reloaded.title).toBe('改名后的回归书');
    expect(reloaded.currentCfi).toBe(named.currentCfi);
    await contextA.close();
    await contextB.close();
  } finally {
    await contextA.close().catch(() => undefined);
    await contextB.close().catch(() => undefined);
  }
});
