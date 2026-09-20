import { describe, expect, it } from 'vitest';
import { libraryMcpTools, mcpConfig } from './mcpConfig';

describe('MCP HTTP 连接配置', () => {
  it('使用 HTTP URL 和 Bearer 请求头直接连接', () => {
    const value = JSON.parse(mcpConfig('https://reading.example', 'test-token'));
    expect(value.mcpServers['learning-center']).toEqual({
      type: 'http',
      url: 'https://reading.example/api/openapi/mcp',
      headers: { Authorization: 'Bearer test-token' },
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
