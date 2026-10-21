import { expect, test, type Page } from '@playwright/test';
import { prepareWorkspace } from './workspace-fixtures';

async function openPanel(page: Page, label: string, mobile: boolean) {
  if (mobile) {
    const tabs = page.getByRole('navigation', { name: '切换更多功能' });
    if (!(await tabs.isVisible()))
      await page.getByRole('button', { name: '打开更多功能，默认显示 AI 助手' }).click();
    await tabs
      .getByRole('button', {
        name: label === 'AI 助手' ? '打开 AI 助手' : `打开${label}`,
        exact: true,
      })
      .click();
  } else
    await page
      .getByRole('button', {
        name: label === 'AI 助手' ? '打开 AI 助手并继续当前对话' : `打开${label}`,
        exact: true,
      })
      .click();
}

for (const theme of ['light', 'dark']) {
  for (const width of [375, 768, 1024, 1440]) {
    test(`AI 草稿切换及刷新恢复，术语与划线搜索：${theme}-${width}`, async ({ page }, info) => {
      test.skip(info.project.name !== 'desktop-chrome');
      test.setTimeout(120_000);
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await prepareWorkspace(page, { theme, fixedTime: false });
      const snapshot = await (await page.request.get('/api/state/highlights')).json();
      snapshot.state.highlights = ['term', 'highlight'].flatMap((kind) => [
        {
          id: crypto.randomUUID(),
          bookId: 'demo-data-intensive',
          kind,
          cfi: 'epubcfi(/6/2!/4/2/1:0)',
          text: 'Alpha 概念',
          chapter: '第一章',
          definition: '分布式系统',
          comment: '并发控制',
          createdAt: Date.now(),
        },
        {
          id: crypto.randomUUID(),
          bookId: 'demo-data-intensive',
          kind,
          cfi: 'epubcfi(/6/2!/4/2/1:0)',
          text: 'Beta 概念',
          chapter: '第二章',
          createdAt: Date.now() + 1,
        },
      ]);
      expect((await page.request.put('/api/state/highlights', { data: snapshot })).status()).toBe(
        204,
      );
      await page.goto('/books/demo-data-intensive');
      const mobile = width <= 800;
      await openPanel(page, 'AI 助手', mobile);
      const editor = page.locator('.reader-ai-input .tiptap');
      await editor.fill('待发送的问题\n保留第二行');
      await openPanel(page, '术语表', mobile);
      const search = page.getByRole('textbox', { name: '搜索术语', exact: true });
      await search.fill('分布式');
      await expect(page.locator('.glossary-term__title')).toHaveText(['Alpha 概念']);
      await search.fill('不存在的关键词');
      await expect(page.getByText('没有匹配结果', { exact: true })).toBeVisible();
      await search.fill('');
      await expect(page.locator('.glossary-term__title')).toHaveCount(2);
      await openPanel(page, '高亮', mobile);
      await page.getByRole('textbox', { name: '搜索划线', exact: true }).fill('alpha');
      await expect(page.locator('.highlight-card > p')).toHaveText(['Alpha 概念']);
      await page.getByRole('textbox', { name: '搜索划线', exact: true }).fill('第二章');
      await expect(page.locator('.highlight-card > p')).toHaveText(['Beta 概念']);
      await openPanel(page, 'AI 助手', mobile);
      await expect(editor).toHaveText('待发送的问题保留第二行');
      await expect
        .poll(async () => {
          const saved = await (await page.request.get('/api/state/preferences')).json();
          return saved.state.conversationDrafts.some(
            (draft: { text: string }) => draft.text === '待发送的问题\n保留第二行',
          );
        })
        .toBe(true);
      await page.reload();
      await openPanel(page, 'AI 助手', mobile);
      await expect(editor).toHaveText('待发送的问题保留第二行');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({ path: info.outputPath(`draft-${theme}-${width}.png`) });
    });
  }
}
