import { expect, test, type Page } from '@playwright/test';
import { demoBooks } from '../../src/util/fixtures/demo';
import type { AiJob } from '../../src/api/ai/type';

const book = demoBooks[0];

async function seed(page: Page, themeMode: 'light' | 'dark' = 'light') {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '我的书架' })).toBeVisible();
  for (const [domain, changes] of Object.entries({
    library: { books: [book] },
    conversations: { chats: [], chatSessions: [] },
    preferences: {
      themeMode,
      openAIConfigs: [
        {
          id: 'activity-test',
          name: '测试模型',
          baseUrl: 'https://example.invalid/v1',
          apiKey: 'test-only',
          models: ['test-model'],
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      aiPreferences: { provider: 'api:activity-test', model: 'test-model' },
    },
  })) {
    const snapshot = await (await page.request.get(`/api/state/${domain}`)).json();
    Object.assign(snapshot.state, changes);
    snapshot.version = 33;
    expect((await page.request.put(`/api/state/${domain}`, { data: snapshot })).status()).toBe(204);
  }
}

function entry(page: Page, mobile: boolean) {
  return mobile
    ? page.locator('.reader-toolbar--mobile button').last()
    : page.locator('.activity-bar button').first();
}

async function mockJobs(page: Page, delayedStart = false, background = false) {
  let job: AiJob | undefined = background
    ? {
        id: 'activity-job',
        bookId: book.id,
        conversationId: 'other-conversation',
        userMessageId: 'background-user',
        assistantMessageId: 'activity-answer',
        status: 'running',
        revision: 1,
        content: '其他对话的后台任务',
        dialogueContent: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
    : undefined;
  let servedRevision = 0;
  let submitted = false;
  let cancellations = 0;
  let releaseStart = () => {};
  const startGate = new Promise<void>((resolve) => {
    releaseStart = resolve;
  });
  await page.route('**/api/ai/jobs**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === 'DELETE') cancellations++;
    if (request.method() === 'POST') {
      submitted = true;
      const input = request.postDataJSON();
      if (delayedStart) await startGate;
      job = {
        id: 'activity-job',
        bookId: book.id,
        conversationId: input.conversationId,
        userMessageId: input.userMessage.id,
        assistantMessageId: 'activity-answer',
        status: 'running',
        revision: 1,
        content: '正在后台继续生成',
        dialogueContent: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      return route.fulfill({ status: 202, json: job });
    }
    if (url.pathname.endsWith('/events')) return route.abort();
    servedRevision = job?.revision ?? 0;
    return route.fulfill({
      json:
        url.pathname === '/api/ai/jobs'
          ? {
              jobs:
                job &&
                (!url.searchParams.get('conversationId') ||
                  url.searchParams.get('conversationId') === job.conversationId)
                  ? [job]
                  : [],
            }
          : job,
    });
  });
  return {
    submitted: () => submitted,
    servedRevision: () => servedRevision,
    noteChanged: () => {
      if (job)
        job = { ...job, revision: job.revision + 1, notesRevision: (job.notesRevision ?? 0) + 1 };
    },
    cancellations: () => cancellations,
    releaseStart,
    complete: () => {
      if (job)
        job = {
          ...job,
          revision: job.revision + 1,
          status: 'completed',
          content: '后台生成的最终回复',
          completedAt: Date.now(),
        };
    },
    progress: (content: string) => {
      if (job) job = { ...job, revision: job.revision + 1, content };
    },
    fail: () => {
      if (job) job = { ...job, revision: 2, status: 'failed', error: '测试失败' };
    },
  };
}

async function send(page: Page) {
  const input = page.locator('.reader-ai-input [contenteditable="true"]');
  await input.fill('请解释这一章');
  await input.press('Enter');
}

test('查看旧内容时保持未读，滚动到回复末尾才标记已读', async ({ page }, testInfo) => {
  const mobile = testInfo.project.name === 'mobile-chrome';
  await seed(page);
  const jobs = await mockJobs(page);
  await page.goto(`/books/${book.id}`);
  await entry(page, mobile).click();
  await expect(page.getByRole('button', { name: '发送提示词：生成信息图' })).toBeDisabled();
  await send(page);
  await expect(page.getByText('正在后台继续生成', { exact: true })).toBeVisible();
  jobs.progress(
    Array.from(
      { length: 80 },
      (_, index) => `第 ${index + 1} 段：用于验证阅读位置的回复内容。`,
    ).join('\n\n'),
  );
  const list = page.locator('.semi-ai-chat-dialogue-list');
  await expect(
    page.getByText('第 80 段：用于验证阅读位置的回复内容。', { exact: true }),
  ).toBeVisible();
  await list.evaluate((element) => {
    element.scrollTop = 0;
    element.dispatchEvent(new Event('scroll'));
  });
  // Keep the completed reply long so completion itself cannot move the end into view.
  jobs.complete();
  jobs.progress(
    Array.from({ length: 80 }, (_, index) => `第 ${index + 1} 段：完整回复内容。`).join('\n\n'),
  );
  await expect(page.locator('.reader-ai-activity--unread').first()).toBeAttached();
  await expect
    .poll(async () => {
      const state = await (await page.request.get('/api/state/conversations')).json();
      return state.state.chats.find((message: { id: string }) => message.id === 'activity-answer')
        ?.content;
    })
    .toContain('第 80 段');
  const unread = await (await page.request.get('/api/state/conversations')).json();
  expect(
    unread.state.chats.find((message: { id: string }) => message.id === 'activity-answer')?.readAt,
  ).toBeUndefined();
  await list.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(page.locator('.reader-ai-activity--unread')).toHaveCount(0);
});

test('发送后立即收起再打开，尚未创建的任务仍能恢复进度并在后台完成', async ({ page }, testInfo) => {
  const mobile = testInfo.project.name === 'mobile-chrome';
  await seed(page);
  const jobs = await mockJobs(page, true);
  await page.goto(`/books/${book.id}`);
  const button = entry(page, mobile);
  await button.click();
  await send(page);
  await expect.poll(jobs.submitted).toBe(true);
  if (mobile) await page.evaluate(() => history.back());
  else await button.click();
  await expect(page.locator('.reader-ai-input')).toBeHidden();
  await button.click();
  jobs.releaseStart();
  await expect(page.getByText('正在后台继续生成', { exact: true })).toBeVisible();
  if (mobile) await page.evaluate(() => history.back());
  else await button.click();
  jobs.complete();
  await expect(button.locator('[data-ai-activity="unread"]')).toBeVisible();
  expect(jobs.cancellations()).toBe(0);
  await button.click();
  await expect(page.getByText('后台生成的最终回复', { exact: true })).toBeVisible();
  await expect
    .poll(async () => {
      const state = await (await page.request.get('/api/state/conversations')).json();
      return Boolean(
        state.state.chats.find((message: { id: string }) => message.id === 'activity-answer')
          ?.readAt,
      );
    })
    .toBe(true);
});

for (const width of [375, 768, 1024, 1440]) {
  for (const theme of ['light', 'dark'] as const) {
    test(`${width}px ${theme}：运行、未读、已读及刷新恢复`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'desktop-chrome');
      const mobile = width <= 800;
      await page.setViewportSize({ width, height: 900 });
      await seed(page, theme);
      const jobs = await mockJobs(page);
      await page.goto(`/books/${book.id}`);
      const button = entry(page, mobile);
      await button.click();
      await expect(page.getByRole('button', { name: '发送提示词：生成漫画' })).toBeVisible();
      await expect
        .poll(async () => (await page.locator('.right-panel').boundingBox())?.y ?? Infinity)
        .toBeLessThan((page.viewportSize()?.height ?? 900) * 0.15);
      await page.screenshot({ path: testInfo.outputPath('comic-shortcut.png') });
      await send(page);
      await expect(button.locator('[data-ai-activity="running"]')).toBeAttached();
      if (mobile) await page.evaluate(() => history.back());
      else await button.click();
      await expect(button.locator('[data-ai-activity="running"]')).toBeVisible();
      const bounds = await button.boundingBox();
      expect(bounds?.height).toBeGreaterThanOrEqual(44);
      expect(bounds?.width).toBeGreaterThanOrEqual(44);
      await expect(button.locator('[data-ai-activity]')).toHaveCSS(
        'animation-iteration-count',
        'infinite',
      );
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await expect(button.locator('[data-ai-activity]')).toHaveCSS(
        'animation-iteration-count',
        '1',
      );
      jobs.complete();
      await expect(button.locator('[data-ai-activity="unread"]')).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath('unread.png') });
      await page.reload();
      await expect(button.locator('[data-ai-activity="unread"]')).toBeVisible();
      await button.click();
      await expect(page.getByText('后台生成的最终回复', { exact: true })).toBeVisible();
      await expect(page.locator('.reader-ai-activity--unread')).toHaveCount(0);
      if (mobile) await page.evaluate(() => history.back());
      else await button.click();
      await expect(button).not.toHaveAttribute('aria-label', /未读|正在运行/);
      await button.focus();
      await expect(button).toBeFocused();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.reload();
      await expect(button).not.toHaveAttribute('aria-label', /未读|正在运行/);
    });
  }
}

test('浏览 Codex 模型时后台回复更新不会跳回 Kimi', async ({ page }, testInfo) => {
  const mobile = testInfo.project.name === 'mobile-chrome';
  await seed(page);
  const snapshot = await (await page.request.get('/api/state/preferences')).json();
  snapshot.state.openAIConfigs = [
    {
      id: 'kimi',
      name: 'Kimi Coding',
      baseUrl: 'https://example.invalid/v1',
      apiKey: 'test-only',
      models: ['kimi-coding'],
      createdAt: 1,
      updatedAt: 1,
    },
    {
      id: 'codex',
      name: 'ChatGPT Codex',
      baseUrl: 'https://example.invalid/v1',
      apiKey: 'test-only',
      models: Array.from({ length: 30 }, (_, index) => `codex-test-${index}`),
      createdAt: 1,
      updatedAt: 1,
    },
  ];
  snapshot.state.aiPreferences = { provider: 'api:kimi', model: 'kimi-coding' };
  await page.request.put('/api/state/preferences', { data: snapshot });
  const jobs = await mockJobs(page, false, true);
  await page.goto(`/books/${book.id}`);
  await entry(page, mobile).click();
  await expect(page.locator('.reader-ai-input')).toBeVisible();
  await page.locator('.ai-composer-model-cascader').click();
  await page.getByText('ChatGPT Codex', { exact: true }).hover();
  const lastModel = page.getByText('codex-test-29', { exact: true });
  await lastModel.scrollIntoViewIfNeeded();
  await lastModel.hover();
  await page.mouse.wheel(0, 400);
  jobs.progress('更新回复以触发模型选择器重新渲染');
  await expect.poll(jobs.servedRevision).toBe(2);
  await expect(lastModel).toBeVisible();
  await lastModel.click();
  await expect(page.locator('.ai-composer-model-cascader')).toContainText('codex-test-29');
});

test('AI 新建笔记后旧阅读快照不会删除文件，笔记面板及刷新均能显示正文', async ({
  page,
}, testInfo) => {
  const mobile = testInfo.project.name === 'mobile-chrome';
  await seed(page);
  const jobs = await mockJobs(page);
  await page.goto(`/books/${book.id}`);
  await entry(page, mobile).click();
  await send(page);
  await expect(page.getByText('正在后台继续生成', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '打开笔记', exact: true }).click();
  const stale = await (await page.request.get('/api/state/reading')).json();
  const updated = await (await page.request.get('/api/state/notes')).json();
  const content = '工具创建的阅读笔记：这段正文必须保存并显示。';
  const timestamp = Date.now();
  updated.state.notes = [
    {
      id: `book-note:${book.id}`,
      bookId: book.id,
      title: '阅读笔记',
      fileName: 'reading-note.md',
      content,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ];
  expect((await page.request.put('/api/state/notes', { data: updated })).status()).toBe(204);
  expect((await page.request.put('/api/state/reading', { data: stale })).status()).toBe(204);
  jobs.noteChanged();
  jobs.complete();
  // AI is hidden while the task completes; the page-level listener must sync notes.
  const editor = page.getByLabel(`编辑《${book.title}》的 Markdown 笔记`);
  await expect(editor).toContainText(content);
  await page.reload();
  if (mobile) await entry(page, true).click();
  await page.getByRole('button', { name: '打开笔记', exact: true }).click();
  await expect(editor).toContainText(content);
});

test('生成漫画仅对订阅生图可用，发送本章导读需求并防止重复生成', async ({ page }, testInfo) => {
  const mobile = testInfo.project.name === 'mobile-chrome';
  await seed(page);
  await page.goto(`/books/${book.id}`);
  await entry(page, mobile).click();
  const comic = page.getByRole('button', { name: '发送提示词：生成漫画' });
  await expect(comic).toBeDisabled();
  const snapshot = await (await page.request.get('/api/state/preferences')).json();
  snapshot.state.openAIConfigs[0].oauthProvider = 'openai-codex';
  expect((await page.request.put('/api/state/preferences', { data: snapshot })).status()).toBe(204);
  await page.reload();
  if (!(await comic.isVisible())) await entry(page, mobile).click();
  await mockJobs(page);
  await expect(comic).toBeEnabled();
  const request = page.waitForRequest(
    (item) => item.url().endsWith('/api/ai/jobs') && item.method() === 'POST',
  );
  await comic.click();
  const body = (await request).postDataJSON();
  expect(body.bookId).toBe(book.id);
  expect(body.userMessage.content).toContain('当前章节的导读漫画');
  expect(body.userMessage.content).toContain('生活例子');
  expect(body.userMessage.content).toContain('comic');
  await expect(comic).toBeDisabled();
});
