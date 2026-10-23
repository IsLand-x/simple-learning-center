import { expect, test } from '@playwright/test';
import { prepareWorkspace } from './workspace-fixtures';

test.use({ locale: 'zh-CN', reducedMotion: 'reduce', serviceWorkers: 'block' });

for (const width of [375, 768, 1024, 1440]) {
  for (const theme of ['light', 'dark']) {
    test(`AI 公式 ${theme} ${width}`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'desktop-chrome');
      await page.setViewportSize({ width, height: 900 });
      await prepareWorkspace(page, { theme, fixedTime: false });
      const conversationId = `math-${theme}-${width}`;
      const snapshot = await (await page.request.get('/api/state/conversations')).json();
      snapshot.version = 41;
      snapshot.state.chatSessions = [
        {
          id: conversationId,
          bookId: 'demo-data-intensive',
          title: '公式排版测试',
          createdAt: 1,
          updatedAt: 2,
        },
      ];
      snapshot.state.chats = [
        {
          id: `${conversationId}-user`,
          bookId: 'demo-data-intensive',
          conversationId,
          role: 'user',
          content: '解释风险公式',
          createdAt: 1,
        },
        {
          id: `${conversationId}-assistant`,
          bookId: 'demo-data-intensive',
          conversationId,
          role: 'assistant',
          createdAt: 2,
          readAt: 2,
          content: [
            String.raw`行内公式 $a_i^2$ 与 \(E=mc^2\)。`,
            '',
            String.raw`[ \boxed{R(\tau)=\tau\times B(\tau)} ]`,
            '',
            String.raw`\[\frac{1}{2}+\begin{bmatrix}a&b\\c&d\end{bmatrix}\]`,
            '',
            '$$' + Array.from({ length: 20 }, (_, index) => `x_{${index}}`).join('+') + '$$',
            '',
            '代码：`' + String.raw`\[\frac{1}{2}\]` + '`',
            '',
            String.raw`未完成公式：\[\frac{1}{`,
          ].join('\n'),
        },
      ];
      expect(
        (await page.request.put('/api/state/conversations', { data: snapshot })).status(),
      ).toBe(204);
      const violations: string[] = [];
      const failedFonts: string[] = [];
      page.on('console', (message) => {
        if (/content security policy/i.test(message.text())) violations.push(message.text());
      });
      page.on('response', (response) => {
        if (/KaTeX_.*\.woff2?$/.test(response.url()) && !response.ok())
          failedFonts.push(response.url());
      });
      await page.goto('/books/demo-data-intensive');
      if (width <= 800) await page.locator('.reader-toolbar--mobile button').last().click();
      else await page.locator('.activity-bar button').first().click();
      await page.getByRole('button', { name: /对话历史/ }).click();
      await page.getByText('公式排版测试', { exact: true }).click();
      const dialogue = page.locator('.semi-chat-area');
      await expect(dialogue.locator('.katex-display')).toHaveCount(3);
      await expect(dialogue.locator('.katex')).toHaveCount(5);
      await expect(dialogue.locator('.fbox')).toBeAttached();
      await expect(dialogue.locator('math')).toHaveCount(5);
      await expect(dialogue.locator('code')).toHaveText(String.raw`\[\frac{1}{2}\]`);
      await page.evaluate(() => document.fonts.ready);
      expect(await page.evaluate(() => document.fonts.check('16px KaTeX_Main'))).toBe(true);
      const longFormula = dialogue.locator('.katex-display').last();
      expect(
        await longFormula.evaluate((element) => element.scrollWidth > element.clientWidth),
      ).toBe(true);
      await longFormula.evaluate((element) => {
        element.scrollLeft = element.scrollWidth;
      });
      expect(await longFormula.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      expect(failedFonts).toEqual([]);
      expect(violations).toEqual([]);
      await page.screenshot({ path: testInfo.outputPath(`ai-math-${theme}-${width}.png`) });
    });
  }
}
