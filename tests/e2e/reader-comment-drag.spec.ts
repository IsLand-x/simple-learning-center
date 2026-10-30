import { expect, test, type Page } from '@playwright/test';
import { prepareWorkspace } from './workspace-fixtures';

async function openComment(page: Page) {
  await page.goto('/books/demo-data-intensive');
  await page
    .locator('.reader-prose > p')
    .first()
    .evaluate((paragraph) => {
      const range = document.createRange();
      range.selectNodeContents(paragraph);
      const selection = window.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
      document.dispatchEvent(new Event('selectionchange'));
    });
  await page
    .getByRole('toolbar', { name: '文本选择操作' })
    .getByRole('button', { name: /评论$/ })
    .click();
  const editor = page.locator('.highlight-comment-editor');
  await expect(editor).toBeVisible();
  await expect(editor.locator('textarea')).toBeFocused();
  await editor.locator('textarea').fill('移开输入框，继续对照原文。');
  return editor;
}

for (const theme of ['light', 'dark']) {
  for (const width of [375, 768, 1024, 1440]) {
    test(`六点把手拖动、边界及评论保存：${theme}-${width}`, async ({ page }, info) => {
      test.skip(info.project.name !== 'desktop-chrome');
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await prepareWorkspace(page, { theme, fixedTime: false });
      const editor = await openComment(page);
      const handle = editor.getByRole('button', { name: '拖动评论输入框' });
      await expect(handle.locator('svg path')).toHaveCount(6);
      await expect(handle).toHaveCSS('cursor', 'grab');
      await expect(handle).toHaveCSS('touch-action', 'none');
      const before = (await editor.boundingBox())!;
      const grip = (await handle.boundingBox())!;
      await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
      await page.mouse.down();
      await expect(handle).toHaveCSS('cursor', 'grabbing');
      await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2 + 100, { steps: 5 });
      await page.mouse.up();
      await expect(handle).toHaveCSS('cursor', 'grab');
      // 鼠标事件返回时，浏览器的几何读取仍可能落后于已更新的位置样式。
      await expect.poll(async () => (await editor.boundingBox())?.y).toBeCloseTo(before.y + 100, 0);
      const after = (await editor.boundingBox())!;
      await expect(editor.locator('textarea')).toBeFocused();
      await expect(editor.locator('textarea')).toHaveValue('移开输入框，继续对照原文。');
      const chapter = await page.locator('.reader-prose h1').textContent();
      await handle.focus();
      await page.keyboard.press('ArrowDown');
      await expect.poll(async () => (await editor.boundingBox())?.y).toBeCloseTo(after.y + 10, 0);
      await expect(page.locator('.reader-prose h1')).toHaveText(chapter!);
      await page.screenshot({ path: info.outputPath(`comment-drag-${theme}-${width}.png`) });
      const moved = (await handle.boundingBox())!;
      await page.mouse.move(moved.x + moved.width / 2, moved.y + moved.height / 2);
      await page.mouse.down();
      await expect(handle).toHaveCSS('cursor', 'grabbing');
      await page.mouse.move(0, 0);
      await page.mouse.up();
      await expect(handle).toHaveCSS('cursor', 'grab');
      await expect
        .poll(async () => {
          const rect = await editor.boundingBox();
          return { x: rect?.x, y: rect?.y };
        })
        .toEqual({ x: 8, y: 8 });
      const bounded = (await editor.boundingBox())!;
      expect(bounded.x).toBeGreaterThanOrEqual(8);
      expect(bounded.y).toBeGreaterThanOrEqual(8);
      expect(bounded.x + bounded.width).toBeLessThanOrEqual(width - 8);
      if (width === 1440) {
        await page.setViewportSize({ width: 375, height: 700 });
        await expect
          .poll(async () => {
            const rect = (await editor.boundingBox())!;
            return (
              rect.x >= 8 &&
              rect.x + rect.width <= 367 &&
              rect.y >= 8 &&
              rect.y + rect.height <= 692
            );
          })
          .toBe(true);
        await expect(editor.locator('textarea')).toHaveValue('移开输入框，继续对照原文。');
      }
      await editor.locator('textarea').focus();
      await page.keyboard.press('Control+Enter');
      await expect(editor).toBeHidden();
      await expect
        .poll(async () => {
          const snapshot = await (await page.request.get('/api/state/highlights')).json();
          return snapshot.state.highlights.some(
            (item: { comment?: string }) => item.comment === '移开输入框，继续对照原文。',
          );
        })
        .toBe(true);
    });
  }
}

test('触屏拖动及虚拟键盘可视区域变化不会关闭或丢失评论', async ({ page }, info) => {
  test.skip(info.project.name !== 'mobile-chrome');
  await prepareWorkspace(page, { fixedTime: false });
  const editor = await openComment(page);
  const handle = editor.getByRole('button', { name: '拖动评论输入框' });
  const before = (await editor.boundingBox())!;
  const box = (await handle.boundingBox())!;
  const session = await page.context().newCDPSession(page);
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
  await expect(handle).toHaveCSS('cursor', 'grabbing');
  await session.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ ...point, y: point.y + 80 }],
  });
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(handle).toHaveCSS('cursor', 'grab');
  await expect
    .poll(async () => (await editor.boundingBox())?.y)
    .toBeCloseTo(Math.min(before.y + 80, page.viewportSize()!.height - before.height - 8), 0);
  await page.evaluate(() => {
    Object.defineProperty(window.visualViewport, 'height', {
      configurable: true,
      value: innerHeight - 320,
    });
    window.visualViewport!.dispatchEvent(new Event('resize'));
  });
  await expect(editor).toBeVisible();
  await expect(editor.locator('textarea')).toHaveValue('移开输入框，继续对照原文。');
  await expect
    .poll(async () => {
      const rect = (await editor.boundingBox())!;
      const height = await page.evaluate(() => window.visualViewport!.height);
      return rect.y + rect.height <= height - 8;
    })
    .toBe(true);
  await session.detach();
  await editor.getByRole('button', { name: '取消', exact: true }).click();
  await expect(editor).toBeHidden();
});
