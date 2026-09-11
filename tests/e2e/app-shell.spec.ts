import { expect, test, type Page } from '@playwright/test';
import {
  DEFAULT_READER_AI_ASSISTANT_PROMPT,
  READER_AI_PROMPT_TEMPLATES,
} from '../../src/lib/readerAiPrompts';

interface SubmittedAiJob {
  bookId: string;
  conversationId: string;
  userMessage: {
    id: string;
    content: string;
  };
}

async function selectTheme(page: Page, theme: 'light' | 'dark') {
  const currentTheme = await page.locator('body').getAttribute('theme-mode');
  if (currentTheme === theme) return;
  const targetLabel = theme === 'dark' ? '切换为深色主题' : '切换为浅色主题';
  await page.getByRole('button', { name: targetLabel }).click();
  await expect(page.locator('body')).toHaveAttribute('theme-mode', theme);
}

async function expectInsideViewport(page: Page, selector: string) {
  await expect
    .poll(async () => {
      const bounds = await page.locator(selector).boundingBox();
      const viewport = page.viewportSize();
      if (!bounds || !viewport) return false;
      return bounds.y >= 0 && bounds.y + bounds.height <= viewport.height + 0.5;
    })
    .toBe(true);
}

test('all top-level routes load through their state-domain gates', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chrome');

  await page.goto('/');
  await expect(page.getByRole('heading', { name: '我的书架' })).toBeVisible();

  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: '设置' })).toBeVisible();

  await page.goto('/rss?source=all&range=all');
  await expect(page.getByRole('heading', { name: 'RSS', exact: true })).toBeVisible();

  await page.goto('/videos');
  await expect(page.getByRole('heading', { name: '视频学习' })).toBeVisible();
});

test('theme switching keeps the application on semantic dark mode', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chrome');

  await page.goto('/');
  await selectTheme(page, 'dark');
  await expect(page.locator('body')).toHaveAttribute('theme-mode', 'dark');
});

test('representative viewport and theme combinations keep the shell stable', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chrome');
  test.setTimeout(60_000);

  const viewports = [
    { width: 375, height: 812 },
    { width: 768, height: 1024 },
    { width: 1024, height: 768 },
    { width: 1440, height: 900 },
  ];

  for (const theme of ['light', 'dark'] as const) {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto('/');
    await selectTheme(page, theme);

    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await page.goto('/');
      await expect(page.locator('body')).toHaveAttribute('theme-mode', theme);
      await expect(page.getByRole('heading', { name: '我的书架' })).toBeVisible();

      const dimensions = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }));
      expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);

      if (viewport.width <= 800) {
        await expect(page.locator('.mobile-main-nav')).toBeVisible();
        await expectInsideViewport(page, '.mobile-main-nav');
        await expect(page.locator('.main-nav')).toBeHidden();
      } else {
        await expect(page.locator('.main-nav')).toBeVisible();
        await expect(page.locator('.mobile-main-nav')).toBeHidden();
      }
    }
  }
});

test('mobile library uses the bottom navigation without horizontal overflow', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chrome');

  await page.goto('/');
  await expect(page.getByRole('heading', { name: '我的书架' })).toBeVisible();
  await expect(page.locator('.mobile-main-nav')).toBeVisible();
  await expectInsideViewport(page, '.mobile-main-nav');
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
});

test('reader AI user messages preserve authored line breaks on desktop and mobile', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chrome');

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '我的书架' })).toBeVisible();
  await expect
    .poll(async () => {
      const response = await page.request.get('/api/state/library');
      return response.status();
    })
    .toBe(200);

  const conversationsResponse = await page.request.get('/api/state/conversations');
  expect(conversationsResponse.ok()).toBe(true);
  const conversations = await conversationsResponse.json();
  const createdAt = Date.now();
  const conversationId = 'e2e-reader-line-breaks';
  conversations.state.chatSessions = [
    ...(conversations.state.chatSessions ?? []).filter(
      (session: { id?: string }) => session.id !== conversationId,
    ),
    {
      id: conversationId,
      bookId: 'demo-data-intensive',
      title: '分段消息显示验证',
      createdAt,
      updatedAt: createdAt,
    },
  ];
  conversations.state.chats = [
    ...(conversations.state.chats ?? []).filter(
      (message: { conversationId?: string }) => message.conversationId !== conversationId,
    ),
    {
      id: 'e2e-reader-line-breaks-message',
      bookId: 'demo-data-intensive',
      conversationId,
      role: 'user',
      content: '第一段描述\n第二段描述',
      createdAt,
    },
  ];
  const writeResponse = await page.request.put('/api/state/conversations', {
    data: conversations,
  });
  expect(writeResponse.status()).toBe(204);

  await page.goto('/books/demo-data-intensive');
  await page.getByRole('button', { name: '打开对话历史' }).click();
  await page.getByRole('button', { name: /分段消息显示验证/ }).click();

  const userParagraph = page.locator('.ai-message--user p').filter({ hasText: '第一段描述' });
  await expect(userParagraph).toContainText('第二段描述');
  const expectLineBreaks = async () => {
    const lineMetrics = await userParagraph.evaluate((element) => {
      const style = window.getComputedStyle(element);
      return {
        height: element.getBoundingClientRect().height,
        lineHeight: Number.parseFloat(style.lineHeight),
        whiteSpace: style.whiteSpace,
      };
    });
    expect(lineMetrics.whiteSpace).toBe('pre-wrap');
    expect(lineMetrics.height).toBeGreaterThan(lineMetrics.lineHeight * 1.5);
  };

  await expectLineBreaks();

  await page.setViewportSize({ width: 375, height: 812 });
  await expect(page.getByRole('dialog').getByText('第一段描述')).toBeVisible();
  await expectLineBreaks();
});

test('reader AI shortcuts, assistant style, and reasoning visibility persist', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chrome');

  await page.goto('/');
  await expect(page.getByRole('heading', { name: '我的书架' })).toBeVisible();
  const preferencesResponse = await page.request.get('/api/state/preferences');
  expect(preferencesResponse.ok()).toBe(true);
  const preferences = await preferencesResponse.json();
  const timestamp = Date.now();
  preferences.state.openAIConfigs = [
    {
      id: 'e2e-reader-prompts',
      name: '快捷提示词测试模型',
      baseUrl: 'https://example.invalid/v1',
      apiKey: 'e2e-placeholder',
      models: ['mock-model'],
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ];
  preferences.state.aiPreferences = {
    provider: 'api:e2e-reader-prompts',
    model: 'mock-model',
    assistantPrompt: DEFAULT_READER_AI_ASSISTANT_PROMPT,
    autoHideReasoning: false,
  };
  const preferencesWrite = await page.request.put('/api/state/preferences', {
    data: preferences,
  });
  expect(preferencesWrite.status()).toBe(204);

  let submittedJob: SubmittedAiJob | undefined;
  await page.route('**/api/ai/jobs', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    submittedJob = route.request().postDataJSON() as SubmittedAiJob;
    const now = Date.now();
    await route.fulfill({
      contentType: 'application/json',
      json: {
        id: 'e2e-shortcut-job',
        bookId: submittedJob.bookId,
        resourceType: 'book',
        purpose: 'chat',
        conversationId: submittedJob.conversationId,
        userMessageId: submittedJob.userMessage.id,
        assistantMessageId: 'e2e-shortcut-assistant',
        status: 'failed',
        revision: 1,
        content: '',
        dialogueContent: [
          {
            type: 'reasoning',
            status: 'in_progress',
            summary: [{ type: 'summary_text', text: '正在核对章节结构。' }],
          },
        ],
        error: '测试已拦截模型请求',
        createdAt: now,
        updatedAt: now,
        completedAt: now,
      },
    });
  });

  await page.goto('/books/demo-data-intensive');
  await page.getByRole('button', { name: '打开 AI 助手并继续当前对话' }).click();
  const shortcuts = page.getByRole('group', { name: 'AI 快捷提示词' });
  await expect(shortcuts).toBeVisible();
  await expect(shortcuts.getByRole('button')).toHaveCount(READER_AI_PROMPT_TEMPLATES.length);
  const summarizeChapter = page.getByRole('button', { name: '发送提示词：总结本章' });
  await expect(summarizeChapter).toBeEnabled();
  await summarizeChapter.click();
  await expect
    .poll(() => submittedJob?.userMessage?.content)
    .toBe(
      READER_AI_PROMPT_TEMPLATES.find((template) => template.id === 'summarize-chapter')?.prompt,
    );
  await expect(page.locator('.csp-chat-reasoning')).toHaveAttribute('open', '');

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/books/demo-data-intensive');
  await page.getByRole('button', { name: '打开更多功能，默认显示 AI 助手' }).click();
  await expect(shortcuts).toBeVisible();
  const mobileShortcutHeight = await summarizeChapter.evaluate(
    (element) => element.getBoundingClientRect().height,
  );
  expect(Math.round(mobileShortcutHeight)).toBeGreaterThanOrEqual(44);
  await expectInsideViewport(page, '.reader-ai-input');
  const mobileDimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(mobileDimensions.scrollWidth).toBeLessThanOrEqual(mobileDimensions.clientWidth);

  await page.goto('/settings');
  await page.getByRole('tab', { name: 'AI 助手' }).click();
  const promptInput = page.getByRole('textbox', { name: '阅读助手自定义 Prompt' });
  const autoHideReasoning = page.getByRole('switch', { name: '自动隐藏思考过程' });
  const customPrompt = '请先用一句话给出结论，再用三个问题帮助我检查理解。';
  await expect(promptInput).toHaveValue(DEFAULT_READER_AI_ASSISTANT_PROMPT);
  await expect(autoHideReasoning).not.toBeChecked();
  expect(Math.round((await autoHideReasoning.boundingBox())?.height ?? 0)).toBeGreaterThanOrEqual(
    44,
  );
  await promptInput.fill(customPrompt);
  await autoHideReasoning.check();
  await page.getByRole('button', { name: '保存设置' }).click();
  await expect(page.getByText('阅读助手设置已保存')).toBeVisible();
  await expect
    .poll(async () => {
      const response = await page.request.get('/api/state/preferences');
      const snapshot = await response.json();
      return snapshot.state.aiPreferences;
    })
    .toMatchObject({ assistantPrompt: customPrompt, autoHideReasoning: true });

  await page.goto('/books/demo-data-intensive');
  await page.getByRole('button', { name: '打开更多功能，默认显示 AI 助手' }).click();
  await summarizeChapter.click();
  const hiddenReasoning = page.locator('.csp-chat-reasoning');
  await expect(hiddenReasoning).not.toHaveAttribute('open');
  await hiddenReasoning.locator('summary').click();
  await expect(hiddenReasoning).toHaveAttribute('open', '');
});
