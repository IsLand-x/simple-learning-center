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

async function mockJobs(page: Page, delayedStart = false) {
  let job: AiJob | undefined;
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
    return route.fulfill({
      json: url.pathname === '/api/ai/jobs' ? { jobs: job ? [job] : [] } : job,
    });
  });
  return {
    submitted: () => submitted,
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
