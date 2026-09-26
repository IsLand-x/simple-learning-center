import { expect, test, type Page } from '@playwright/test';
import { fixtureArticleTitle, fixtureVideo, prepareWorkspace } from './workspace-fixtures';

test.use({ locale: 'zh-CN', timezoneId: 'Asia/Shanghai', serviceWorkers: 'block' });
test.beforeEach(async ({ page }) => prepareWorkspace(page));

async function savedRssArticle(page: Page) {
  const response = await page.request.get('/api/state/rss');
  const snapshot = await response.json();
  return snapshot.state.rssItems.find(
    (item: { id: string }) => item.id === 'e2e-reading-article',
  ) as { readAt?: number; bookmarkedAt?: number };
}

test('RSS article selection and bookmarks survive navigation and reload', async ({
  page,
}, testInfo) => {
  await page.goto('/rss?source=all&range=all&view=items');
  await page.getByRole('button', { name: new RegExp(fixtureArticleTitle) }).click();
  await expect(page.getByRole('heading', { name: fixtureArticleTitle })).toBeVisible();
  await expect.poll(async () => (await savedRssArticle(page)).readAt).toBeGreaterThan(0);

  await page.getByRole('button', { name: '收藏', exact: true }).click();
  await expect(page.getByRole('button', { name: '取消收藏', exact: true })).toBeVisible();
  await expect.poll(async () => (await savedRssArticle(page)).bookmarkedAt).toBeGreaterThan(0);
  await page.reload();
  await expect(page.getByRole('heading', { name: fixtureArticleTitle })).toBeVisible();
  await expect(page.getByRole('button', { name: '取消收藏', exact: true })).toBeVisible();

  if (testInfo.project.name === 'mobile-chrome') {
    await page.getByRole('button', { name: '返回订阅内容列表' }).click();
    await expect(page.getByRole('region', { name: '订阅内容列表' })).toBeVisible();
    await page.getByRole('button', { name: '返回订阅源' }).click();
  }
  await page.locator('.rss-source-row--smart').filter({ hasText: '收藏' }).click();
  await expect(page.locator('.rss-item-row')).toHaveCount(1);
  await page.getByRole('button', { name: new RegExp(fixtureArticleTitle) }).click();
  await page.getByRole('button', { name: '取消收藏', exact: true }).click();
  await expect.poll(async () => Boolean((await savedRssArticle(page)).bookmarkedAt)).toBe(false);
});

test('video captions and notes persist, and desktop deletion removes related records', async ({
  page,
}, testInfo) => {
  test.setTimeout(60_000);
  await page.goto(`/videos?video=${fixtureVideo.id}`);
  const modes = page.getByRole('group', { name: '字幕语言' });
  await expect(modes.getByRole('button', { name: '双语', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await modes.getByRole('button', { name: '中文', exact: true }).click();
  await expect(page.locator('.video-transcript-row').first()).toContainText(
    '阅读前，先提出一个问题。',
  );
  await expect(page.locator('.video-transcript-row').first()).not.toContainText('Start with');
  await page.locator('.video-transcript-row').nth(1).click();
  await expect(page.locator('.video-transcript-row--active')).toContainText('0:30');

  const note = '主动回忆：先合上书，用自己的语言回答问题。';
  const editor = page.locator('[contenteditable="true"][aria-label="视频学习笔记"]');
  await editor.fill(note);
  await expect
    .poll(async () => {
      const response = await page.request.get('/api/state/reading');
      const snapshot = await response.json();
      return snapshot.state.notes.find(
        (item: { bookId: string }) => item.bookId === `video:${fixtureVideo.id}`,
      )?.content;
    })
    .toContain(note);
  await page.reload();
  await expect(editor).toContainText(note);

  // The existing mobile workspace hides the desktop resource toolbar and its deletion action.
  if (testInfo.project.name === 'mobile-chrome') return;
  await page.getByRole('button', { name: '删除视频资料', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('学习笔记和 AI 对话会一并删除');
  await page.keyboard.press('Enter');
  await expect(page.getByText('还没有视频资料', { exact: true })).toBeVisible();
  await expect
    .poll(async () => {
      const response = await page.request.get('/api/state/videos');
      return (await response.json()).state.videoResources;
    })
    .toEqual([]);
  await expect
    .poll(async () => {
      const response = await page.request.get('/api/state/reading');
      return (await response.json()).state.notes.filter(
        (item: { bookId: string }) => item.bookId === `video:${fixtureVideo.id}`,
      );
    })
    .toEqual([]);
});

test('video import sends the submitted URL and reuses the resulting resource', async ({ page }) => {
  let importedUrl = '';
  await page.route('**/api/videos/import', async (route) => {
    importedUrl = route.request().postDataJSON().url;
    await route.fulfill({
      json: {
        ...fixtureVideo,
        youtubeVideoId: 'e2eImport02',
        title: '导入测试：带着问题学习',
        url: 'https://www.youtube.com/watch?v=e2eImport02',
      },
    });
  });
  await page.goto('/videos');
  await page.getByRole('button', { name: '添加 YouTube 视频' }).click();
  const dialog = page.getByRole('dialog', { name: '添加 YouTube 视频' });
  await dialog
    .getByPlaceholder('https://www.youtube.com/watch?v=...')
    .fill('https://www.youtube.com/watch?v=e2eImport02');
  await dialog.getByRole('button', { name: '读取视频', exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(importedUrl).toBe('https://www.youtube.com/watch?v=e2eImport02');
  await expect(page).toHaveURL(/video=e2eImport02/);
  await expect(page.locator('.video-detail-toolbar__identity')).toContainText(
    '导入测试：带着问题学习',
  );
  await expect
    .poll(async () => {
      const response = await page.request.get('/api/state/videos');
      return (await response.json()).state.videoResources.map(
        (video: { youtubeVideoId: string }) => video.youtubeVideoId,
      );
    })
    .toContain('e2eImport02');
  await page.reload();
  await expect(page.locator('.video-detail-toolbar__identity')).toContainText(
    '导入测试：带着问题学习',
  );
});
