import { expect, test, type Page } from '@playwright/test';
import {
  DEFAULT_READER_AI_ASSISTANT_PROMPT,
  READER_AI_PROMPT_TEMPLATES,
} from '../../src/lib/readerAiPrompts';
import { demoBooks } from '../../src/data/demo';

interface SubmittedAiJob {
  bookId: string;
  conversationId: string;
  reasoningEffort?: string;
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

async function expectFormModalEdgeSpacing(page: Page, minimumSpacing: number) {
  await expect
    .poll(async () => {
      const [modalBounds, titleBounds, actionBounds] = await Promise.all([
        page.locator('.epub-import-modal .semi-modal-content').boundingBox(),
        page.locator('.epub-import-modal .semi-modal-title').boundingBox(),
        page.locator('.epub-import-modal__actions').boundingBox(),
      ]);
      if (!modalBounds || !titleBounds || !actionBounds) return false;
      const topSpacing = titleBounds.y - modalBounds.y;
      const bottomSpacing =
        modalBounds.y + modalBounds.height - (actionBounds.y + actionBounds.height);
      return topSpacing >= minimumSpacing && bottomSpacing >= minimumSpacing;
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

test('form modals preserve their top and bottom safe spacing', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chrome');

  for (const theme of ['light', 'dark'] as const) {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto('/');
    await selectTheme(page, theme);

    for (const viewport of [
      { width: 375, height: 812, minimumSpacing: 20 },
      { width: 1440, height: 900, minimumSpacing: 24 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto('/');
      await expect(page.locator('body')).toHaveAttribute('theme-mode', theme);
      await page.getByRole('button', { name: '导入 EPUB' }).click();
      await expect(page.getByRole('dialog', { name: '导入 EPUB' })).toBeVisible();
      await expectFormModalEdgeSpacing(page, viewport.minimumSpacing);
      await page.getByRole('button', { name: '取消' }).click();
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

test('library book context menu dismisses and manages pinning, lists, tags, and trash', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chrome');

  await page.goto('/');
  await selectTheme(page, 'light');
  const libraryResponse = await page.request.get('/api/state/library');
  expect(libraryResponse.ok()).toBe(true);
  const library = await libraryResponse.json();
  library.state.books = [
    demoBooks[0],
    ...(library.state.books ?? [])
      .filter((book: { id?: string }) => book.id !== 'demo-data-intensive')
      .map((book: Record<string, unknown>) => ({ ...book, pinnedAt: undefined })),
  ];
  library.state.bookLists = [
    {
      id: 'e2e-reading-list',
      name: '技术学习',
      note: '',
      bookIds: ['demo-data-intensive'],
      createdAt: 1,
      updatedAt: 1,
    },
    {
      id: 'e2e-backlog-list',
      name: '待读',
      note: '',
      bookIds: [],
      createdAt: 2,
      updatedAt: 2,
    },
  ];
  const libraryWrite = await page.request.put('/api/state/library', { data: library });
  expect(libraryWrite.status()).toBe(204);
  await page.reload();

  const bookCard = page.locator('.book-card').filter({ hasText: 'Designing Data-Intensive' });
  await expect(bookCard.getByText('技术学习', { exact: true })).toBeVisible();
  await bookCard.click({ button: 'right', position: { x: 80, y: 80 } });
  const contextMenu = page.locator('.library-book-context-menu');
  await expect(contextMenu).toBeVisible();
  const [cardBounds, menuBounds] = await Promise.all([
    bookCard.boundingBox(),
    contextMenu.boundingBox(),
  ]);
  expect(Math.abs((menuBounds?.x ?? 0) - ((cardBounds?.x ?? 0) + 80))).toBeLessThanOrEqual(1);
  expect(Math.abs((menuBounds?.y ?? 0) - ((cardBounds?.y ?? 0) + 80))).toBeLessThanOrEqual(1);

  await page.getByRole('heading', { name: '我的书架' }).click();
  await expect(contextMenu).toBeHidden();

  await bookCard.click({ button: 'right' });
  await contextMenu.getByRole('menuitem', { name: /置顶$/ }).click();
  const pinnedSection = page.getByRole('region', { name: '置顶书籍' });
  const otherBooksSection = page.getByRole('region', { name: '其他书籍' });
  await expect(pinnedSection).toContainText('Designing Data-Intensive Applications');
  await expect(bookCard.getByRole('button', { name: /取消置顶《/ })).toHaveCount(0);
  const [pinnedBounds, otherBooksBounds] = await Promise.all([
    pinnedSection.boundingBox(),
    otherBooksSection.boundingBox(),
  ]);
  expect((pinnedBounds?.y ?? 0) + (pinnedBounds?.height ?? 0)).toBeLessThanOrEqual(
    otherBooksBounds?.y ?? 0,
  );

  await bookCard.click({ button: 'right' });
  await contextMenu.getByRole('menuitem', { name: /取消置顶$/ }).click();
  await expect(pinnedSection).toBeHidden();

  await bookCard.click({ button: 'right' });
  await contextMenu.getByRole('menuitem', { name: /移动到书单/ }).hover();
  const listSubmenu = page.locator('.library-book-list-submenu');
  await expect(listSubmenu).toBeVisible();
  const listItems = listSubmenu.getByRole('menuitem');
  await expect(listItems).toHaveCount(3);
  await expect(listItems.nth(0)).toContainText('技术学习');
  await expect(listItems.nth(1)).toContainText('待读');
  await expect(listItems.nth(2)).toContainText('新建书单');
  await expect(listItems.nth(0).getByRole('img', { name: 'tick' })).toBeVisible();
  await listItems.nth(0).click();
  await expect(listSubmenu).toBeVisible();
  await expect(bookCard.getByText('技术学习', { exact: true })).toBeHidden();
  await expect(listItems.nth(0).getByRole('img', { name: 'tick' })).toHaveCount(0);
  await listItems.nth(0).click();
  await expect(listSubmenu).toBeVisible();
  await expect(bookCard.getByText('技术学习', { exact: true })).toBeVisible();
  await expect(listItems.nth(0).getByRole('img', { name: 'tick' })).toBeVisible();
  await listItems.nth(1).click();
  await expect(listSubmenu).toBeVisible();
  await expect(bookCard.getByText('待读', { exact: true })).toBeVisible();
  await page.getByRole('heading', { name: '我的书架' }).click();
  await expect(contextMenu).toBeHidden();

  await bookCard.click({ button: 'right' });
  await page.getByRole('menuitem', { name: /移动到书单/ }).hover();
  await page.locator('.library-book-list-submenu').getByText('新建书单').click();
  const editor = page.getByRole('dialog', { name: '新建书单' });
  await expect(editor).toBeVisible();
  await editor.getByRole('textbox', { name: '名称' }).fill('章节精读');
  await editor.getByRole('button', { name: '保存' }).click();
  await expect(bookCard.getByText('章节精读', { exact: true })).toBeVisible();

  await bookCard.click({ button: 'right' });
  await page.locator('.library-book-context-menu').getByText('删除', { exact: true }).click();
  const trashDialog = page.getByRole('dialog', {
    name: '将《Designing Data-Intensive Applications》移到回收站？',
  });
  await expect(trashDialog).toBeVisible();
  await expect(trashDialog).toContainText(
    '书籍和相关学习记录会保留 30 天；期间可以恢复，也可以在回收站中彻底删除。',
  );
  await expect(trashDialog.getByText('移到回收站', { exact: true })).toBeVisible();
  await trashDialog.getByRole('button', { name: 'cancel' }).click();
  await expect(bookCard).toBeVisible();

  await page.getByRole('button', { name: /书单/ }).click();
  const bookListNavigation = page.getByRole('complementary', { name: '书单列表' });
  const bookListDetail = page.locator('.book-list-detail');
  await expect(bookListNavigation).toBeVisible();
  await expect(bookListDetail).toBeVisible();
  const [navigationBounds, detailBounds] = await Promise.all([
    bookListNavigation.boundingBox(),
    bookListDetail.boundingBox(),
  ]);
  expect(navigationBounds?.y).toBe(detailBounds?.y);
  expect(Math.round(navigationBounds?.x ?? 0) + Math.round(navigationBounds?.width ?? 0)).toBe(
    Math.round(detailBounds?.x ?? 0),
  );

  const manageBooksButton = bookListDetail.getByRole('button', { name: '管理书籍' });
  await expect(manageBooksButton).toBeVisible();
  await expect(manageBooksButton).toHaveText('');
  await manageBooksButton.hover();
  await expect(page.getByRole('tooltip')).toContainText('管理书籍');
});

test('reader AI composer preserves authored paragraphs on desktop and mobile', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chrome');

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '我的书架' })).toBeVisible();
  const libraryResponse = await page.request.get('/api/state/library');
  expect(libraryResponse.ok()).toBe(true);
  const library = await libraryResponse.json();
  library.state.books = [
    ...(library.state.books ?? []).filter(
      (book: { id?: string }) => book.id !== 'demo-data-intensive',
    ),
    demoBooks[0],
  ];
  const libraryWrite = await page.request.put('/api/state/library', { data: library });
  expect(libraryWrite.status()).toBe(204);

  const preferencesResponse = await page.request.get('/api/state/preferences');
  expect(preferencesResponse.ok()).toBe(true);
  const preferences = await preferencesResponse.json();
  const timestamp = Date.now();
  preferences.state.openAIConfigs = [
    {
      id: 'e2e-reader-paragraphs',
      name: '多段输入测试模型',
      baseUrl: 'https://example.invalid/v1',
      apiKey: 'e2e-placeholder',
      models: ['mock-model'],
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ];
  preferences.state.aiPreferences = {
    ...(preferences.state.aiPreferences ?? {}),
    provider: 'api:e2e-reader-paragraphs',
    model: 'mock-model',
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
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      json: { error: '测试已拦截模型请求' },
    });
  });

  await page.goto('/books/demo-data-intensive');
  const readerArticle = page.locator('.demo-reader article');
  const desktopReaderCursor = await readerArticle.evaluate(
    (element) => getComputedStyle(element).cursor,
  );
  expect(desktopReaderCursor).toContain('data:image/svg+xml');
  expect(desktopReaderCursor).toContain('14 14');
  await page.getByRole('button', { name: /打开 AI 助手/ }).click();
  const reasoningSelector = page.getByRole('combobox', { name: '选择 AI 强度' });
  await expect(reasoningSelector).toBeVisible();
  await expect(reasoningSelector).toContainText('强度 · 自动');
  await expect(reasoningSelector).not.toContainText('推理');
  await expect(reasoningSelector.locator('.semi-select-arrow')).toHaveCount(0);
  await reasoningSelector.click();
  await page.getByRole('option', { name: 'tick 高', exact: true }).click();
  await expect(reasoningSelector).toContainText('强度 · 高');
  const editor = page.locator('.reader-ai-input .tiptap');
  await editor.click();
  await editor.pressSequentially('第一段描述');
  await editor.press('Shift+Enter');
  await editor.press('Shift+Enter');
  await editor.pressSequentially('第二段描述');
  await page.locator('.reader-ai-input .semi-aiChatInput-footer-action-button').click();
  await expect.poll(() => submittedJob?.userMessage.content).toBe('第一段描述\n\n第二段描述');
  expect(submittedJob?.reasoningEffort).toBe('high');

  const userBubble = page.locator('.ai-message--user').last();
  const expectParagraphStack = async () => {
    await expect(userBubble.locator('p')).toHaveCount(2);
    const layout = await userBubble.evaluate((element) => {
      const paragraphs = Array.from(element.querySelectorAll('p')).map((paragraph) => {
        const bounds = paragraph.getBoundingClientRect();
        return { top: bounds.top, bottom: bounds.bottom };
      });
      return {
        flexDirection: window.getComputedStyle(element).flexDirection,
        paragraphs,
      };
    });
    expect(layout.flexDirection).toBe('column');
    expect(layout.paragraphs[1].top).toBeGreaterThanOrEqual(layout.paragraphs[0].bottom);
  };

  await expectParagraphStack();

  await page.setViewportSize({ width: 375, height: 812 });
  await expect(userBubble).toBeVisible();
  await expectParagraphStack();
  await expect(readerArticle).toHaveCSS('cursor', 'text');
  expect(Math.round((await reasoningSelector.boundingBox())?.height ?? 0)).toBeGreaterThanOrEqual(
    44,
  );
});

test('reader AI highlight questions and in-panel settings persist across desktop and mobile', async ({
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
    hiddenPromptTemplateIds: [],
  };
  const preferencesWrite = await page.request.put('/api/state/preferences', {
    data: preferences,
  });
  expect(preferencesWrite.status()).toBe(204);

  const highlightedText = '复制意味着在通过网络连接的多台机器上保留同一份数据副本。';
  const readingResponse = await page.request.get('/api/state/reading');
  expect(readingResponse.ok()).toBe(true);
  const reading = await readingResponse.json();
  reading.state.highlights = [
    ...(reading.state.highlights ?? []).filter(
      (highlight: { id?: string }) => highlight.id !== 'e2e-ai-highlight',
    ),
    {
      id: 'e2e-ai-highlight',
      bookId: 'demo-data-intensive',
      kind: 'highlight',
      text: highlightedText,
      cfi: 'demo:chapter-5:e2e-ai-highlight',
      chapter: '第五章 · 复制',
      page: 186,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ];
  const readingWrite = await page.request.put('/api/state/reading', { data: reading });
  expect(readingWrite.status()).toBe(204);

  const libraryResponse = await page.request.get('/api/state/library');
  expect(libraryResponse.ok()).toBe(true);
  const library = await libraryResponse.json();
  library.state.books = library.state.books.map((book: { id?: string }) =>
    book.id === 'demo-data-intensive'
      ? {
          ...book,
          currentChapter: '第五章 · 复制',
          currentCfi: 'demo:chapter-5:scroll:0',
          currentPage: 186,
          progress: 42,
          updatedAt: timestamp,
        }
      : book,
  );
  const libraryWrite = await page.request.put('/api/state/library', { data: library });
  expect(libraryWrite.status()).toBe(204);

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
  const highlight = page.getByRole('button', { name: highlightedText });
  await expect(highlight).toBeVisible();
  await highlight.click();
  const highlightToolbar = page.getByRole('toolbar', { name: '已高亮内容操作' });
  await expect(
    highlightToolbar.getByRole('button', { name: '使用已高亮内容向 AI 提问' }),
  ).toBeVisible();
  await highlightToolbar.getByRole('button', { name: '使用已高亮内容向 AI 提问' }).click();
  await expect(page.locator('.reader-ai-input .semi-aiChatInput-reference')).toContainText(
    highlightedText,
  );
  await expect(page.getByRole('button', { name: '新建 AI 对话' })).toBeVisible();

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

  const settingsButton = page.getByRole('button', { name: '打开 AI 助手设置' });
  await expect(settingsButton).toBeVisible();
  await settingsButton.click();
  const settingsDialog = page.getByRole('dialog', { name: 'AI 助手设置' });
  await expect(settingsDialog).toBeVisible();
  const promptInput = settingsDialog.getByRole('textbox', { name: '阅读助手自定义 Prompt' });
  const autoHideReasoning = settingsDialog.getByRole('switch', {
    name: '自动隐藏思考过程',
  });
  const summarizeBookVisibility = settingsDialog.getByRole('switch', {
    name: '显示快捷方式：总结全书',
  });
  const customPrompt = '请先用一句话给出结论，再用三个问题帮助我检查理解。';
  await expect(promptInput).toHaveValue(DEFAULT_READER_AI_ASSISTANT_PROMPT);
  await expect(autoHideReasoning).not.toBeChecked();
  await expect(summarizeBookVisibility).toBeChecked();
  await promptInput.fill(customPrompt);
  await autoHideReasoning.check();
  await summarizeBookVisibility.uncheck();
  await settingsDialog.getByRole('button', { name: '保存设置' }).click();
  await expect(settingsDialog).toBeHidden();
  await expect(page.getByText('阅读助手设置已保存')).toBeVisible();
  await expect(shortcuts.getByRole('button')).toHaveCount(READER_AI_PROMPT_TEMPLATES.length - 1);
  await expect(page.getByRole('button', { name: '发送提示词：总结全书' })).toBeHidden();
  await expect(page.locator('.csp-chat-reasoning')).not.toHaveAttribute('open');
  await expect
    .poll(async () => {
      const response = await page.request.get('/api/state/preferences');
      const snapshot = await response.json();
      return snapshot.state.aiPreferences;
    })
    .toMatchObject({
      assistantPrompt: customPrompt,
      autoHideReasoning: true,
      hiddenPromptTemplateIds: ['summarize-book'],
    });

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/books/demo-data-intensive');
  await page.getByRole('button', { name: '打开更多功能，默认显示 AI 助手' }).click();
  await expect(shortcuts).toBeVisible();
  await expect(shortcuts.getByRole('button')).toHaveCount(READER_AI_PROMPT_TEMPLATES.length - 1);
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
  expect(Math.round((await settingsButton.boundingBox())?.height ?? 0)).toBeGreaterThanOrEqual(44);
  await settingsButton.click();
  await expect(settingsDialog).toBeVisible();
  await expect
    .poll(() =>
      summarizeBookVisibility.evaluate(
        (element) => element.closest('label')?.getBoundingClientRect().height ?? 0,
      ),
    )
    .toBeGreaterThanOrEqual(43.5);
  await expect(summarizeBookVisibility).not.toBeChecked();
  await page.evaluate(() => window.history.back());
  await expect(settingsDialog).toBeHidden();
  await expect(page.getByRole('navigation', { name: '切换更多功能' })).toBeVisible();
  await expect(settingsButton).toBeVisible();

  await page.goto('/settings');
  await page.getByRole('tab', { name: 'AI 助手' }).click();
  await expect(page.getByRole('textbox', { name: '阅读助手自定义 Prompt' })).toHaveValue(
    customPrompt,
  );
  await expect(page.getByRole('switch', { name: '自动隐藏思考过程' })).toBeChecked();
  await expect(page.getByRole('switch', { name: '显示快捷方式：总结全书' })).not.toBeChecked();
});
