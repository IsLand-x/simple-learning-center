import { expect, test } from '@playwright/test';
import { expectSemiButtonSize } from './semi-button-size';
import { demoBooks } from '../../src/data/demo';
import type { BookImageResource } from '../../src/features/reader/model/bookResources';

const book = demoBooks[0];
const imageId = '11111111-1111-4111-8111-111111111111';
const imageUrl = `/api/books/${book.id}/knowledge-maps/${imageId}`;
const svg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="720"><rect width="1200" height="720" fill="#f5f5f5"/><text x="600" y="360" text-anchor="middle" fill="#222" font-size="60">概念 → 机制 → 应用</text></svg>';

for (const width of [375, 768, 1024, 1440]) {
  for (const theme of ['light', 'dark']) {
    test(`书籍资源库保存、恢复、预览与移除 ${width} ${theme}`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'desktop-chrome');
      test.setTimeout(60_000);
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto('/');
      await expect(page.getByRole('heading', { name: '我的书架' })).toBeVisible();
      for (const [domain, changes] of Object.entries({
        library: { books: [book] },
        conversations: {
          chatSessions: [
            {
              id: 'resources-session',
              bookId: book.id,
              title: '资源库测试对话',
              createdAt: 1,
              updatedAt: 2,
            },
          ],
          chats: [
            {
              id: 'resources-message',
              bookId: book.id,
              conversationId: 'resources-session',
              role: 'assistant',
              content: `![机制图](${imageUrl})\n\n![重复引用](${imageUrl})`,
              createdAt: 2,
            },
          ],
        },
        preferences: { themeMode: theme },
      })) {
        const snapshot = await (await page.request.get(`/api/state/${domain}`)).json();
        Object.assign(snapshot.state, changes);
        expect((await page.request.put(`/api/state/${domain}`, { data: snapshot })).status()).toBe(
          204,
        );
      }
      await page.route(`**${imageUrl}`, (route) =>
        route.fulfill({ contentType: 'image/svg+xml', body: svg }),
      );
      await page.route('**/api/ai/jobs**', (route) => route.fulfill({ json: { jobs: [] } }));
      let resources: BookImageResource[] = [];
      let failSave = true;
      let failRemove = true;
      let failRename = true;
      await page.route(`**/api/books/${book.id}/resources**`, (route) => {
        const method = route.request().method();
        if (method === 'POST') {
          if (failSave) {
            failSave = false;
            return route.fulfill({ status: 500, json: { error: '测试保存失败，请重试' } });
          }
          const input = route.request().postDataJSON();
          resources = [{ ...input, savedAt: Date.now(), url: imageUrl }];
        }
        if (method === 'PATCH') {
          if (failRename) {
            failRename = false;
            return route.fulfill({ status: 500, json: { error: '测试重命名失败，请重试' } });
          }
          const { title } = route.request().postDataJSON();
          resources = resources.map((resource) => ({ ...resource, title }));
        }
        if (method === 'DELETE') {
          if (failRemove) {
            failRemove = false;
            return route.fulfill({ status: 500, json: { error: '测试移除失败，请重试' } });
          }
          resources = [];
        }
        return route.fulfill({ json: { resources } });
      });
      await page.goto(`/books/${book.id}`);
      const openPanel = async () => {
        if (width <= 800) await page.locator('.reader-toolbar--mobile button').last().click();
        else await page.getByRole('button', { name: '打开资源库', exact: true }).click();
      };
      await openPanel();
      if (width <= 800) await page.getByRole('button', { name: '打开资源库', exact: true }).click();
      await expect(page.getByText('还没有保存的图片')).toBeVisible();
      await page.getByRole('button', { name: /打开对话历史/ }).click();
      await page.getByText('资源库测试对话', { exact: true }).click();
      const save = page.getByRole('button', { name: '保存到资源库', exact: true }).first();
      await expect(save).toBeEnabled();
      await save.focus();
      await expect(save).toBeFocused();
      await expectSemiButtonSize(save);
      await save.click();
      await expect(page.getByText('测试保存失败，请重试')).toBeVisible();
      await save.click();
      await expect(page.getByRole('button', { name: '已保存到资源库', exact: true })).toHaveCount(
        2,
      );
      for (const button of await page
        .getByRole('button', { name: '已保存到资源库', exact: true })
        .all())
        await expect(button).toBeDisabled();
      await page.getByRole('button', { name: '打开资源库', exact: true }).click();
      await expect(page.locator('.book-resources__item')).toHaveCount(1);
      const titleButton = page.getByRole('button', { name: '重命名图片：机制图' });
      await titleButton.dblclick();
      const titleInput = page.getByRole('textbox', { name: '图片标题' });
      await expect(titleInput).toBeFocused();
      await titleInput.fill('取消的标题');
      await titleInput.press('Escape');
      await expect(titleButton).toBeFocused();
      await titleButton.press('F2');
      await expect(titleInput).toHaveValue('机制图');
      await titleInput.fill('   ');
      await titleInput.press('Enter');
      await expect(page.getByRole('form', { name: '重命名资源' }).getByRole('alert')).toContainText(
        '标题不能为空',
      );
      await titleInput.fill('修改后的机制图');
      await titleInput.press('Enter');
      await expect(page.getByRole('form', { name: '重命名资源' }).getByRole('alert')).toContainText(
        '测试重命名失败，请重试',
      );
      await expect(titleInput).toHaveValue('修改后的机制图');
      await titleInput.press('Enter');
      await expect(titleInput).toHaveCount(0);
      await expect(page.getByRole('button', { name: '重命名图片：修改后的机制图' })).toBeFocused();
      const trigger = page.getByRole('button', { name: '全屏查看图片：修改后的机制图' });
      await expect(trigger.locator('img')).toHaveJSProperty('naturalWidth', 1200);
      await page.screenshot({ path: testInfo.outputPath(`resources-${width}-${theme}.png`) });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      await trigger.click();
      const viewer = page.getByLabel('全屏图片查看器');
      await expect(viewer).toBeVisible();
      await page.goBack();
      await expect(viewer).toHaveCount(0);
      await expect(trigger).toBeVisible();
      await page.reload();
      await openPanel();
      if (width <= 800) await page.getByRole('button', { name: '打开资源库', exact: true }).click();
      await expect(page.locator('.book-resources__item')).toHaveCount(1);
      await expect(page.getByRole('button', { name: '重命名图片：修改后的机制图' })).toBeVisible();
      const remove = page.getByRole('button', { name: '移除图片：修改后的机制图' });
      await expectSemiButtonSize(remove);
      await remove.click();
      await expect(page.getByRole('heading', { name: '从资源库移除图片？' })).toBeVisible();
      await page.goBack();
      await expect(page.getByRole('heading', { name: '从资源库移除图片？' })).toHaveCount(0);
      await expect(page.locator('.book-resources__item')).toHaveCount(1);
      await remove.click();
      await page.getByRole('button', { name: '取消', exact: true }).click();
      await expect(page.locator('.book-resources__item')).toHaveCount(1);
      await remove.click();
      await page.getByRole('button', { name: '移除', exact: true }).click();
      await expect(page.getByText('测试移除失败，请重试')).toBeVisible();
      await expect(page.locator('.book-resources__item')).toHaveCount(1);
      await page.getByRole('button', { name: '移除', exact: true }).click();
      await expect(page.getByText('还没有保存的图片')).toBeVisible();
      await page.getByRole('button', { name: /打开对话历史/ }).click();
      await page.getByText('资源库测试对话', { exact: true }).click();
      await expect(page.getByRole('button', { name: '全屏查看图片：机制图' })).toBeVisible();
      await expect(save).toBeEnabled();
    });
  }
}
