import { serverRequest } from '../../../lib/serverApi';

export async function readMcpToken() {
  return (await serverRequest('/api/settings/openapi-token/mcp')).json() as Promise<{
    configured: boolean;
    token: string | null;
  }>;
}

export function mcpConfig(origin: string, token: string) {
  return JSON.stringify(
    {
      mcpServers: {
        'learning-center': {
          type: 'http',
          url: `${origin}/api/openapi/mcp`,
          headers: { Authorization: `Bearer ${token}` },
        },
      },
    },
    null,
    2,
  );
}

export const libraryMcpTools = [
  ['list_book', '列出书籍', '名称、作者、阅读进度及所属书单。'],
  ['edit_book', '编辑书籍', '仅修改所属书单，可加入多个书单或移出所有书单。'],
  ['list_book_highlight_and_comment', '列出高亮和评论', '查看指定书籍的原文摘录、位置和评论。'],
  ['read_book_note', '阅读图书笔记', '读取 Markdown 笔记，支持分段阅读长笔记。'],
  ['trash_book', '移入回收站', '保留关联数据，可在应用内恢复；30 天后自动清理。'],
  ['list_book_list', '列出书单', '查看书单名称、说明、包含的书籍及更新时间。'],
  ['edit_book_list', '编辑书单', '修改已有书单的名称、说明和书籍列表，校验更新时间以避免覆盖。'],
  [
    'upload_book',
    '导入书籍',
    '传入 EPUB 文件名和 Base64 内容，最大 10 MiB；HTTP 文件上传接口支持最大 100 MiB。',
  ],
] as const;
