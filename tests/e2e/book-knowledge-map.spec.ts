import { expectSemiButtonSize } from './semi-button-size';
import { expect, test } from '@playwright/test';
import type { AiJob } from '../../src/util/ai/aiJobs';
import { demoBooks } from '../../src/util/fixtures/demo';

const book = demoBooks[0];
const imageUrl = `/api/books/${book.id}/knowledge-maps/11111111-1111-4111-8111-111111111111`;
const imageFixture =
  '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="720"><rect width="1200" height="720" fill="#f5f5f5"/><text x="600" y="300" text-anchor="middle" fill="#222222" font-size="44">全景知识地图（测试图片）</text><text x="600" y="400" text-anchor="middle" fill="#222222" font-size="30">主题 → 核心观点 → 论据与含义</text></svg>';

for (const scenario of [
  { label: '全景知识地图', prompt: '全景知识地图工具', alt: '全景知识地图' },
  { label: '生成信息图', prompt: '信息图工具', alt: '信息图' },
]) {
  for (const width of [375, 768, 1024, 1440]) {
    for (const theme of ['light', 'dark']) {
      test(`${scenario.label}入口、图片与历史 ${width} ${theme}`, async ({ page }, testInfo) => {
        test.setTimeout(60_000);
        test.skip(testInfo.project.name !== 'desktop-chrome');
        await page.setViewportSize({ width, height: 900 });
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.goto('/');
        await expect(page.getByRole('heading', { name: '我的书架' })).toBeVisible();
        for (const [domain, changes] of Object.entries({
          library: { books: [book] },
          conversations: { chats: [], chatSessions: [] },
          preferences: {
            themeMode: theme,
            openAIConfigs: [
              {
                id: 'map-test',
                name: 'ChatGPT',
                oauthProvider: 'openai-codex',
                baseUrl: '',
                apiKey: '',
                models: ['test-model'],
                createdAt: 1,
                updatedAt: 1,
              },
            ],
            aiPreferences: { provider: 'api:map-test', model: 'test-model' },
          },
        })) {
          const snapshot = await (await page.request.get(`/api/state/${domain}`)).json();
          Object.assign(snapshot.state, changes);
          snapshot.version = 33;
          expect(
            (await page.request.put(`/api/state/${domain}`, { data: snapshot })).status(),
          ).toBe(204);
        }
        await page.route(`**${imageUrl}`, (route) =>
          route.fulfill({ contentType: 'image/svg+xml', body: imageFixture }),
        );
        let conversationId = '';
        let job: AiJob | undefined;
        let cancelled = false;
        const content = `信息图内容稿：复制方式对比\n\n图型：维度对比图；原文概括，对应来源 s1\n\n![${scenario.alt}](${imageUrl})\n\n[查看或保存原图](${imageUrl})\n\n核心观点与含义\n\n覆盖全部已提取正文；不包含扫描图片。`;
        await page.route('**/api/ai/jobs**', async (route) => {
          const request = route.request();
          if (request.method() === 'POST') {
            const input = request.postDataJSON();
            expect(input.userMessage.content).toContain(scenario.prompt);
            conversationId = input.conversationId;
            job = {
              id: 'map-job',
              bookId: book.id,
              conversationId,
              userMessageId: input.userMessage.id,
              assistantMessageId: 'map-result',
              status: 'running',
              revision: 1,
              content,
              createdAt: Date.now(),
              updatedAt: Date.now(),
            };
            return route.fulfill({ status: 202, json: job });
          }
          if (request.method() === 'DELETE') cancelled = true;
          if (request.url().endsWith('/events')) return route.abort();
          return route.fulfill({
            json:
              new URL(request.url()).pathname === '/api/ai/jobs' ? { jobs: job ? [job] : [] } : job,
          });
        });
        await page.goto(`/books/${book.id}`);
        if (width <= 800) await page.locator('.reader-toolbar--mobile button').last().click();
        else await page.locator('.activity-bar button').first().click();
        const shortcut = page.getByRole('button', { name: `发送提示词：${scenario.label}` });
        await expect(shortcut).toBeEnabled();
        await expectSemiButtonSize(shortcut);
        await shortcut.focus();
        await expect(shortcut).toBeFocused();
        await shortcut.click();
        await expect(shortcut).toBeDisabled();
        const image = page.locator('.expandable-image img');
        await expect(image).toBeVisible();
        await expect(image).toHaveJSProperty('naturalWidth', 1200);
        await expect(page.getByRole('link', { name: '查看或保存原图' })).toHaveAttribute(
          'href',
          imageUrl,
        );
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        ).toBe(true);
        expect(cancelled).toBe(false);
        await page.screenshot({ path: testInfo.outputPath(`map-${width}-${theme}.png`) });
        const trigger = page.getByRole('button', { name: `全屏查看图片：${scenario.alt}` });
        await trigger.focus();
        await page.keyboard.press('Enter');
        const viewer = page.getByLabel('全屏图片查看器');
        await expect(viewer).toBeVisible();
        // Semi mounts the visible dialog before its entry transform has settled.
        await expect.poll(() => viewer.boundingBox()).toEqual({ x: 0, y: 0, width, height: 900 });
        await expect(viewer.getByRole('img', { name: scenario.alt })).toHaveJSProperty(
          'naturalWidth',
          1200,
        );
        await viewer.getByRole('button', { name: '放大图片', exact: true }).click();
        await expect(viewer.getByRole('button', { name: '恢复图片适应屏幕' })).toHaveText('125%');
        await page.keyboard.press('+');
        await expect(viewer.getByRole('button', { name: '恢复图片适应屏幕' })).toHaveText('150%');
        await expect
          .poll(() =>
            viewer
              .locator('.image-viewer__canvas')
              .evaluate(
                (element) =>
                  element.scrollWidth > element.clientWidth &&
                  element.scrollHeight > element.clientHeight,
              ),
          )
          .toBe(true);
        for (const button of await viewer.getByRole('button').all()) {
          await expectSemiButtonSize(button);
        }
        await page.keyboard.press('0');
        await expect(viewer.getByRole('button', { name: '恢复图片适应屏幕' })).toHaveText('100%');
        await page.screenshot({ path: testInfo.outputPath(`viewer-${width}-${theme}.png`) });
        await page.goBack();
        await expect(viewer).toHaveCount(0);
        await expect(trigger).toBeVisible();
        await expect(trigger).toBeFocused();
        await trigger.click();
        await expect(viewer).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(viewer).toHaveCount(0);
        await expect(trigger).toBeVisible();

        const snapshot = await (await page.request.get('/api/state/conversations')).json();
        snapshot.state.chatSessions = [
          {
            id: conversationId,
            bookId: book.id,
            title: '全景知识地图',
            createdAt: 1,
            updatedAt: 2,
          },
        ];
        snapshot.state.chats = [
          {
            id: 'map-result',
            bookId: book.id,
            conversationId,
            role: 'assistant',
            content,
            createdAt: 2,
          },
        ];
        await page.request.put('/api/state/conversations', { data: snapshot });
        job = undefined;
        await page.reload();
        if (width <= 800) await page.locator('.reader-toolbar--mobile button').last().click();
        else await page.locator('.activity-bar button').first().click();
        // Open the persisted conversation through the existing history panel.
        await page.getByRole('button', { name: /对话历史/ }).click();
        await page.getByText('全景知识地图', { exact: true }).last().click();
        await expect(image).toBeVisible();
        await expect(image).toHaveJSProperty('naturalWidth', 1200);
        await trigger.click();
        await expect(viewer).toBeVisible();
        await viewer.getByRole('button', { name: '关闭图片' }).click();
        await expect(viewer).toHaveCount(0);
        await expect(trigger).toBeVisible();
      });
    }
  }
}
