import { readFile } from 'node:fs/promises';
import { expect, test, type Frame, type Page } from '@playwright/test';
import { prepareWorkspace } from './workspace-fixtures';

test.use({
  locale: 'zh-CN',
  timezoneId: 'Asia/Shanghai',
  reducedMotion: 'reduce',
  serviceWorkers: 'block',
});

async function openTypographyBook(page: Page, theme = 'light'): Promise<Frame> {
  await page.route('https://cdn.jsdelivr.net/**', (route) => route.abort());
  await prepareWorkspace(page, { theme });
  const response = await page.request.get('/api/state/preferences');
  const snapshot = await response.json();
  snapshot.state.readerPreferences.theme = theme === 'dark' ? 'ink' : 'ivory';
  snapshot.state.readerStyleUpdatedAt = snapshot.state.readerPreferencesUpdatedAt + 1;
  snapshot.state.readerPreferencesUpdatedAt = snapshot.state.readerStyleUpdatedAt;
  const saved = await page.request.put('/api/state/preferences', { data: snapshot });
  expect(saved.status()).toBe(204);
  const tokenResponse = await page.request.post('/api/settings/openapi-token', {
    headers: { 'X-Learning-Center-Request': '1' },
  });
  const { token } = await tokenResponse.json();
  const upload = await page.request.post('/api/openapi/v1/books?filename=typography.epub', {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/epub+zip' },
    data: await readFile(new URL('../fixtures/reader-typography.epub', import.meta.url)),
  });
  expect(upload.status()).toBe(201);
  const { book } = await upload.json();
  await page.goto(`/books/${book.id}`);
  let frame: Frame | undefined;
  await expect
    .poll(async () => {
      for (const candidate of page.frames()) {
        if (await candidate.locator('h2').count()) {
          frame = candidate;
          return true;
        }
      }
      return false;
    })
    .toBe(true);
  if (!frame) throw new Error('排版测试章节未加载');
  await expect(frame.locator('h1')).toBeVisible();
  await frame.evaluate(() => document.fonts.ready);
  await expect(page.getByText(/第 1 页 \/ 共 \d+ 页/)).toBeVisible();
  return frame;
}

test('EPUB typography preserves hierarchy, list rhythm, code and authored alignment', async ({
  page,
}) => {
  const frame = await openTypographyBook(page);
  const metrics = await frame.evaluate(() => {
    const style = (selector: string) => {
      const element = document.querySelector(selector);
      if (!element) throw new Error(`样张缺少 ${selector}`);
      return getComputedStyle(element);
    };
    const ratio = (value: string, fontSize: string) =>
      Number.parseFloat(value) / Number.parseFloat(fontSize);
    const body = style('body');
    const headings = ['h1', 'h2', 'h3'].map((selector) => {
      const heading = style(selector);
      return {
        size: ratio(heading.fontSize, body.fontSize),
        lineHeight: ratio(heading.lineHeight, heading.fontSize),
        before: Number.parseFloat(heading.marginTop),
        after: Number.parseFloat(heading.marginBottom),
      };
    });
    const listItem = style('li');
    const quote = style('blockquote');
    const code = style('#code');
    return {
      headings,
      titleSpanLineHeight: ratio(style('h2 span').lineHeight, style('h2 span').fontSize),
      listSpacing: ratio(listItem.marginBottom, listItem.fontSize),
      quoteColor: quote.color,
      quoteParagraphColor: style('blockquote p').color,
      quoteEndSpacing: style('blockquote p:last-child').marginBottom,
      codeFont: code.fontFamily,
      codeLineHeight: ratio(code.lineHeight, code.fontSize),
      codeFits: document.querySelector('pre')!.scrollWidth <= document.body.clientWidth,
      tableSpacing: style('#table-cell').marginBottom,
      authoredAlignment: style('.authored').textAlign,
      authoredIndent: ratio(style('.authored').textIndent, style('.authored').fontSize),
      strongWeight: style('strong').fontWeight,
      emphasis: style('em').fontStyle,
    };
  });
  metrics.headings.forEach((heading, index) => {
    expect(heading.size).toBeCloseTo([1.65, 1.35, 1.15][index], 2);
    expect(heading.lineHeight).toBeCloseTo(1.35, 2);
    if (index > 0) expect(heading.before).toBeGreaterThan(heading.after * 2);
  });
  expect(metrics.titleSpanLineHeight).toBeCloseTo(1.35, 2);
  expect(metrics.listSpacing).toBeCloseTo(0.4, 2);
  expect(metrics.quoteParagraphColor).toBe(metrics.quoteColor);
  expect(metrics.quoteEndSpacing).toBe('0px');
  expect(metrics.codeFont).toContain('monospace');
  expect(metrics.codeLineHeight).toBeCloseTo(1.3, 2);
  expect(metrics.codeFits).toBe(true);
  expect(metrics.tableSpacing).toBe('0px');
  expect(metrics.authoredAlignment).toBe('center');
  expect(metrics.authoredIndent).toBeCloseTo(2, 2);
  expect(metrics.strongWeight).toBe('700');
  expect(metrics.emphasis).toBe('italic');
});

for (const theme of ['light', 'dark']) {
  for (const viewport of [
    { width: 375, height: 812 },
    { width: 768, height: 1024 },
    { width: 1024, height: 768 },
    { width: 1440, height: 900 },
  ]) {
    test(`EPUB typography visual: ${theme} ${viewport.width}`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'desktop-chrome');
      await page.setViewportSize(viewport);
      await openTypographyBook(page, theme);
      await expect(page.locator('body')).toHaveAttribute('theme-mode', theme);
      // Keep the actual renderer and original EPUB content in the visual acceptance matrix.
      expect(
        await page
          .locator('foliate-view')
          .evaluate((element) =>
            (element as HTMLElement & { renderer: HTMLElement }).renderer.getAttribute(
              'max-inline-size',
            ),
          ),
      ).toBe('760px');
      await page.mouse.move(0, 0);
      await expect(page).toHaveScreenshot(`epub-${theme}-${viewport.width}.png`, {
        animations: 'disabled',
        caret: 'hide',
        maxDiffPixelRatio: 0.001,
      });
    });
  }
}
