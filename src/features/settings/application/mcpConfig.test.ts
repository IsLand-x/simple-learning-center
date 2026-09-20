import { describe, expect, it } from 'vitest';
import { libraryMcpTools, mcpConfig } from './mcpConfig';

describe('MCP 本机连接配置', () => {
  it('正确转义本机路径并将 Token 放入连接进程环境', () => {
    const value = JSON.parse(
      mcpConfig('https://reading.example', 'test-token', 'C:\\我的书籍\\learning-center-mcp.mjs'),
    );
    expect(value.mcpServers['learning-center']).toEqual({
      command: 'node',
      args: ['C:\\我的书籍\\learning-center-mcp.mjs'],
      env: {
        LEARNING_CENTER_MCP_URL: 'https://reading.example/api/openapi/mcp',
        LEARNING_CENTER_MCP_TOKEN: 'test-token',
      },
    });
    expect(libraryMcpTools.map(([name]) => name)).toEqual([
      'list_book',
      'edit_book',
      'list_book_highlight_and_comment',
      'read_book_note',
      'trash_book',
      'list_book_list',
      'edit_book_list',
      'upload_book',
    ]);
  });
});
