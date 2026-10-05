import { expect, test } from '@playwright/test';
import { demoBooks } from '../../src/util/fixtures/demo';

test('用户自动保存与 AI 追加同时发生，笔记区和刷新结果保留双方内容', async ({ page }, testInfo) => {
  const book = { ...demoBooks[0], id: `note-concurrency-${testInfo.project.name}` };
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '我的书架' })).toBeVisible();
  const library = await (await page.request.get('/api/state/library')).json();
  library.state.books = [book];
  await page.request.put('/api/state/library', { data: library });
  const notes = await (await page.request.get('/api/state/notes')).json();
  const timestamp = Math.max(
    Date.now(),
    ...notes.state.notes.map((note: { updatedAt: number }) => note.updatedAt + 1),
  );
  const note = {
    id: `book-note:${book.id}`,
    bookId: book.id,
    title: '阅读笔记',
    content: '原文',
    fileName: 'reading-note.md',
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  notes.state.notes = [note];
  await page.request.put('/api/state/notes', { data: notes });
  await page.route('**/api/ai/jobs**', (route) => route.fulfill({ json: { jobs: [] } }));
  await page.goto(`/books/${book.id}`);
  if (testInfo.project.name === 'mobile-chrome')
    await page.getByRole('button', { name: '打开更多功能，默认显示 AI 助手' }).click();
  await page.getByRole('button', { name: '打开笔记', exact: true }).click();
  const editor = page.getByLabel(`编辑《${book.title}》的 Markdown 笔记`);
  await expect(editor).toHaveText('原文');
  let submitted = false;
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/state/notes', async (route) => {
    if (route.request().method() !== 'PUT' || submitted) return route.continue();
    const payload = route.request().postDataJSON();
    expect(payload.notesBase.find((item: { id: string }) => item.id === note.id).content).toBe(
      '原文',
    );
    submitted = true;
    await gate;
    await route.continue();
  });
  await editor.fill('用户原文');
  await expect.poll(() => submitted).toBe(true);
  const ai = await (await page.request.get('/api/state/notes')).json();
  ai.state.notes = [{ ...note, content: '原文\n\nAI 新增见解', updatedAt: timestamp + 1 }];
  await page.request.put('/api/state/notes', { data: ai });
  release();
  await expect(editor).toContainText('用户原文');
  await expect(editor).toContainText('AI 新增见解');
  await expect
    .poll(
      async () =>
        (await (await page.request.get('/api/state/notes')).json()).state.notes.find(
          (item: { id: string }) => item.id === note.id,
        ).content,
    )
    .toBe('用户原文\n\nAI 新增见解');
  // Position the DOM caret explicitly: platform shortcuts can race with the
  // editor's focus selection restoration after applying the canonical note.
  await editor.evaluate((element) => {
    const text = element.querySelector('p')?.firstChild;
    if (!text || text.nodeType !== Node.TEXT_NODE) throw new Error('笔记首段缺少文字');
    (element as HTMLElement).focus();
    const range = document.createRange();
    range.setStart(text, 2);
    range.collapse(true);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  });
  await page.keyboard.insertText('继续');
  await expect
    .poll(
      async () =>
        (await (await page.request.get('/api/state/notes')).json()).state.notes.find(
          (item: { id: string }) => item.id === note.id,
        ).content,
    )
    .toBe('用户继续原文\n\nAI 新增见解');
  await page.reload();
  if (testInfo.project.name === 'mobile-chrome')
    await page.getByRole('button', { name: '打开更多功能，默认显示 AI 助手' }).click();
  await page.getByRole('button', { name: '打开笔记', exact: true }).click();
  await expect(editor).toContainText('用户继续原文');
  await expect(editor).toContainText('AI 新增见解');
});
