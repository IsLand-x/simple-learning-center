import { expect, test } from '@playwright/test';
import { prepareWorkspace } from './workspace-fixtures';

test('讨论支持编辑、刷新恢复、章节跳转和删除', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await prepareWorkspace(page, { fixedTime: false });
  const mobile = testInfo.project.name === 'mobile-chrome';
  const open = async () => {
    if (mobile) {
      await page.getByRole('button', { name: '打开更多功能，默认显示 AI 助手' }).click();
      await page
        .getByRole('navigation', { name: '切换更多功能' })
        .getByRole('button', { name: '打开讨论', exact: true })
        .click();
    } else await page.getByRole('button', { name: '打开讨论', exact: true }).click();
  };
  await page.goto('/books/demo-data-intensive');
  await open();
  const panel = page.getByRole('complementary', { name: '讨论', exact: true });
  await panel.getByRole('button', { name: '新建讨论', exact: true }).click();
  const titlebar = panel.locator('.panel-titlebar');
  await expect(titlebar).toHaveCount(1);
  await expect(titlebar.getByRole('button', { name: '返回问题列表', exact: true })).toBeVisible();
  await expect(titlebar.getByRole('button', { name: '删除', exact: true })).toBeVisible();
  const question = `可靠性为什么重要 ${testInfo.project.name}`;
  await panel.getByRole('textbox', { name: '讨论问题' }).fill(question);
  await panel.getByLabel('编辑讨论内容').fill('讨论后的结论：需要考虑故障。');
  await expect
    .poll(async () => {
      const snapshot = await (await page.request.get('/api/state/reading')).json();
      return snapshot.state.discussions?.find(
        (item: { question: string }) => item.question === question,
      )?.content;
    })
    .toContain('讨论后的结论');
  await page.reload();
  await open();
  await panel.getByRole('button', { name: new RegExp(question) }).click();
  await expect(panel.getByLabel('编辑讨论内容')).toContainText('讨论后的结论');
  await panel.getByRole('button', { name: /章 ·/ }).click();
  if (mobile) {
    await expect(panel).toBeHidden();
    await open();
    await panel.getByRole('button', { name: new RegExp(question) }).click();
  }
  await panel.getByRole('button', { name: '删除', exact: true }).click();
  await page.getByRole('button', { name: 'confirm', exact: true }).click();
  await expect(panel.getByRole('button', { name: new RegExp(question) })).toHaveCount(0);
});
