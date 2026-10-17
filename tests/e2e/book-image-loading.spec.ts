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
      let releaseImage!: () => void;
      const imageGate = new Promise<void>((resolve) => {
        releaseImage = resolve;
      });
      let requests = 0;
      let failNext = false;
      await page.route(`**${imageUrl}`, async (route) => {
        if (route.request().method() === 'HEAD')
          return route.fulfill({ headers: { 'X-Image-Width': '900', 'X-Image-Height': '1350' } });
        requests += 1;
        if (failNext) {
          failNext = false;
          return route.fulfill({ status: 503, body: '测试图片暂不可访问' });
        }
        if (requests === 1) await imageGate;
        return route.fulfill({ contentType: 'image/svg+xml', body: imageFixture });
      });
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
      } finally {
        releaseImage();
      }
    });
  }
}
