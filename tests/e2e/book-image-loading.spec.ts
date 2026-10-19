import { expect, test } from '@playwright/test';
import { demoBooks } from '../../src/util/fixtures/demo';

test.use({ serviceWorkers: 'block' });

const book = demoBooks[0];
const imageId = '11111111-1111-4111-8111-111111111111';
const imageUrl = `/api/books/${book.id}/knowledge-maps/${imageId}`;
const imageFixture =
  '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1350"><rect width="900" height="1350" fill="#eee"/><text x="450" y="650" text-anchor="middle" font-size="40">图片加载测试</text></svg>';

for (const width of [375, 768, 1024, 1440]) {
  for (const theme of ['light', 'dark']) {
    test(`AI 图片按比例加载与失败重试 ${width} ${theme}`, async ({ page }, testInfo) => {
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
              id: 'image-loading',
              bookId: book.id,
              title: '图片加载测试',
              createdAt: 1,
              updatedAt: 2,
            },
          ],
          chats: [
            {
              id: 'image-result',
              bookId: book.id,
              conversationId: 'image-loading',
              role: 'assistant',
              content: `![信息图](${imageUrl})`,
              dialogueContent: [
                {
                  type: 'message',
                  role: 'assistant',
                  status: 'completed',
                  content: [{ type: 'output_text', text: `![信息图](${imageUrl})` }],
                },
              ],
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
      // Dark mode also covers historical COS messages: these used to lose the save button.
      const displayUrl =
        theme === 'dark'
          ? `https://images-123456.cos.ap-singapore.myqcloud.com/learning-center/2026-10-19/${imageId}.png`
          : imageUrl;
      if (displayUrl !== imageUrl) {
        const snapshot = await (await page.request.get('/api/state/conversations')).json();
        const chat = snapshot.state.chats[0];
        chat.content = `![信息图](${displayUrl})`;
        chat.dialogueContent[0].content[0].text = chat.content;
        expect(
          (await page.request.put('/api/state/conversations', { data: snapshot })).status(),
        ).toBe(204);
      }
      const older = {
        imageId: '22222222-2222-4222-8222-222222222222',
        title: '早期图片',
        savedAt: 1,
        url: imageUrl,
      };
      let resources = [older];
      let failSave = true;
      await page.route(`**/api/books/${book.id}/resources`, async (route) => {
        if (route.request().method() === 'POST') {
          expect(route.request().postDataJSON()).toEqual({ imageId, title: '信息图' });
          if (failSave) {
            failSave = false;
            return route.fulfill({ status: 503, json: { error: '保存暂不可用' } });
          }
          resources = [...resources, { imageId, title: '信息图', savedAt: 2, url: imageUrl }];
        }
        return route.fulfill({ json: { resources } });
      });
      let releaseImage!: () => void;
      const imageGate = new Promise<void>((resolve) => {
        releaseImage = resolve;
      });
      let requests = 0;
      let failNext = false;
      const serveImage = async (route: import('@playwright/test').Route) => {
        if (route.request().method() === 'HEAD')
          return route.fulfill({ headers: { 'X-Image-Width': '900', 'X-Image-Height': '1350' } });
        requests += 1;
        if (failNext) {
          failNext = false;
          return route.fulfill({ status: 503, body: '测试图片暂不可访问' });
        }
        if (requests === 1) await imageGate;
        return route.fulfill({ contentType: 'image/svg+xml', body: imageFixture });
      };
      await page.route(`**${imageUrl}`, serveImage);
      if (displayUrl !== imageUrl) await page.route(displayUrl, serveImage);
      await page.route('**/api/ai/jobs**', (route) => route.fulfill({ json: { jobs: [] } }));
      const openHistory = async () => {
        if (width <= 800) await page.locator('.reader-toolbar--mobile button').last().click();
        await page.getByRole('button', { name: /打开对话历史/ }).click();
        await page.getByText('图片加载测试', { exact: true }).click();
      };
      try {
        await page.goto(`/books/${book.id}`);
        await openHistory();
        const frame = page.locator('.expandable-image__frame');
        const loading = page.getByRole('status', { name: '图片加载中' });
        await expect(loading).toBeVisible();
        await expect(frame).toHaveCSS('aspect-ratio', '900 / 1350');
        const before = (await frame.boundingBox())!;
        expect(Math.abs(before.height / before.width - 1.5)).toBeLessThan(0.01);
        const trigger = page.getByRole('button', { name: '全屏查看图片：信息图' });
        await expect(trigger).toBeDisabled();
        await page.screenshot({ path: testInfo.outputPath(`image-loading-${width}-${theme}.png`) });
        releaseImage();
        await expect(loading).toHaveCount(0);
        await expect(trigger).toBeEnabled();
        await expect(trigger.locator('img')).toHaveJSProperty('naturalWidth', 900);
        const after = (await frame.boundingBox())!;
        expect(Math.abs(before.height - after.height)).toBeLessThan(1);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
        failNext = true;
        await page.reload();
        await openHistory();
        await expect(page.getByRole('alert', { name: '图片加载失败，点击重试' })).toBeVisible();
        const retry = page.getByRole('button', { name: '重试加载图片：信息图' });
        await expect(retry).toBeEnabled();
        await retry.focus();
        await expect(retry).toBeFocused();
        await page.screenshot({ path: testInfo.outputPath(`image-error-${width}-${theme}.png`) });
        const failedRequests = requests;
        await page.keyboard.press('Enter');
        await expect(trigger).toBeEnabled();
        await expect(trigger.locator('img')).toHaveJSProperty('naturalWidth', 900);
        expect(requests).toBe(failedRequests + 1);
        await trigger.click();
        await expect(page.getByLabel('全屏图片查看器')).toBeVisible();
        await page.goBack();
        await expect(page.getByLabel('全屏图片查看器')).toHaveCount(0);
        const save = page.getByRole('button', { name: '保存到资源库', exact: true });
        await save.click();
        await expect(page.getByText('保存暂不可用', { exact: true })).toBeVisible();
        await expect(save).toBeEnabled();
        await save.click();
        await expect(
          page.getByRole('button', { name: '已保存到资源库', exact: true }),
        ).toBeDisabled();
        await page.getByRole('button', { name: '打开资源库', exact: true }).click();
        const titles = page.locator('.book-resource-title__trigger');
        await expect(titles).toHaveText(['信息图', '早期图片']);
        const sort = page.getByRole('combobox', { name: '排序' });
        await sort.click();
        await page.getByRole('option', { name: '创建时间正序' }).click();
        await expect(titles).toHaveText(['早期图片', '信息图']);
        await sort.focus();
        await page.keyboard.press('Enter');
        await page.getByRole('option', { name: '创建时间倒序' }).click();
        await expect(titles).toHaveText(['信息图', '早期图片']);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
        await page.screenshot({
          path: testInfo.outputPath(`resources-sort-${width}-${theme}.png`),
        });
      } finally {
        releaseImage();
      }
    });
  }
}
