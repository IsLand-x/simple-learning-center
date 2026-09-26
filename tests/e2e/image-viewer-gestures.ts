import { expect, type Locator, type Page } from '@playwright/test';

export async function expectImageGestures(page: Page, viewer: Locator, touch: boolean) {
  const image = viewer.locator('.image-viewer__canvas img');
  const canvas = viewer.locator('.image-viewer__canvas');
  const reset = viewer.getByRole('button', { name: '恢复图片适应屏幕' });
  const bounds = (await canvas.boundingBox())!;
  const x = bounds.x + bounds.width / 2;
  const y = bounds.y + bounds.height / 2;
  const transform = () =>
    image.evaluate((element) => {
      const matrix = new DOMMatrix(getComputedStyle(element).transform);
      return { scale: matrix.a, x: matrix.e, y: matrix.f };
    });
  await page.mouse.move(x, y);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -1000);
  await expect.poll(async () => (await transform()).scale).toBeGreaterThan(1.5);
  await page.mouse.wheel(0, -1000);
  await expect(reset).toHaveText('600%');
  // Wheel delivery and the painted transform can lag the toolbar text in CI.
  // Read the drag origin only after the actual image reaches the requested zoom.
  await expect.poll(async () => (await transform()).scale).toBe(6);
  await page.keyboard.up('Control');
  expect(await page.evaluate(() => window.visualViewport?.scale)).toBe(1);
  const beforeDrag = await transform();
  await page.mouse.down();
  await page.mouse.move(x + 60, y + 40, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => (await transform()).x).toBeCloseTo(beforeDrag.x + 60, 0);
  await expect.poll(async () => (await transform()).y).toBeCloseTo(beforeDrag.y + 40, 0);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, 1000);
  await expect.poll(async () => (await transform()).scale).toBeLessThan(6);
  await page.keyboard.up('Control');
  await reset.click();
  await expect.poll(transform).toEqual({ scale: 1, x: 0, y: 0 });

  if (touch) {
    const session = await page.context().newCDPSession(page);
    const points = (distance: number) => [
      { id: 1, x: x - distance, y },
      { id: 2, x: x + distance, y },
    ];
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points(40) });
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points(80) });
    await expect.poll(async () => (await transform()).scale).toBeCloseTo(2, 1);
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ id: 1, x, y }],
    });
    const before = (await transform()).x;
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ id: 1, x: x + 40, y }],
    });
    await expect.poll(async () => (await transform()).x).toBeCloseTo(before + 40, 0);
    await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    expect(await page.evaluate(() => window.visualViewport?.scale)).toBe(1);
    await session.detach();
    await reset.click();
    await expect.poll(transform).toEqual({ scale: 1, x: 0, y: 0 });
  }
}
