import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { serve } from '@hono/node-server';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const directory = await mkdtemp(join(tmpdir(), 'learning-mcp-'));
process.env.LEARNING_CENTER_DATA_DIR = directory;
const { createApp } = await import('../../app.js');
const { writePersistedState, readPersistedState } = await import('../state/stateStore.js');
after(() => rm(directory, { force: true, recursive: true }));

test('MCP HTTP 直连可调用全部书架工具，并保持权限和数据隔离', async () => {
  const app = createApp({ mode: 'local', serveFrontend: false });
  await writePersistedState({
    version: 25,
    state: {
      books: [{ id: 'b1', title: '测试书', kind: 'epub', progress: 42, updatedAt: 1 }],
      bookLists: [{ id: 'l1', name: '学习', note: '', bookIds: [], createdAt: 1, updatedAt: 1 }],
      notes: [{ id: 'n1', bookId: 'b1', title: '笔记', content: 'abcdef', updatedAt: 1 }],
      highlights: [
        { id: 'h1', bookId: 'b1', text: '摘录', comment: '见解', kind: 'highlight', updatedAt: 1 },
      ],
    },
  });
  const tokenPath = '/api/settings/openapi-token';
  const token = (
    await (
      await app.request(tokenPath, {
        method: 'POST',
        headers: { 'X-Learning-Center-Request': '1' },
      })
    ).json()
  ).token;
  assert.equal((await app.request('/api/openapi/mcp', { method: 'POST' })).status, 401);
  assert.equal(
    (
      await app.request('/api/openapi/mcp', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, Origin: 'https://other.example' },
      })
    ).status,
    403,
  );
  assert.equal((await (await app.request(`${tokenPath}/mcp`)).json()).token, token);
  const malformed = await app.request('/api/openapi/mcp', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: '{invalid',
  });
  assert.equal(malformed.status, 400);
  assert.equal((await malformed.json()).error.code, -32700);
  const remote = createApp({ mode: 'remote', serveFrontend: false });
  assert.equal(
    (await remote.request(`${tokenPath}/mcp`, { headers: { Authorization: `Bearer ${token}` } }))
      .status,
    401,
  );
  const http = serve({ fetch: app.fetch, hostname: '127.0.0.1', port: 0 });
  await new Promise((resolve) => http.once('listening', resolve));
  const url = `http://127.0.0.1:${http.address().port}/api/openapi/mcp`;
  const client = new Client({ name: 'test', version: '1.0.0' });
  try {
    await client.connect(
      new StreamableHTTPClientTransport(new URL(url), {
        requestInit: { headers: { Authorization: `Bearer ${token}` } },
      }),
    );
    const tools = await client.listTools();
    assert.deepEqual(
      tools.tools.map((tool) => tool.name),
      [
        'list_book',
        'edit_book',
        'list_book_highlight_and_comment',
        'read_book_note',
        'trash_book',
        'list_book_list',
        'edit_book_list',
        'upload_book',
      ],
    );
    const call = async (name, args = {}) => {
      const result = await client.callTool({ name, arguments: args });
      assert.ok(!result.isError, JSON.stringify(result));
      return result.structuredContent;
    };
    assert.equal((await call('list_book')).items[0].progress, 42);
    assert.equal(
      (
        await client.callTool({
          name: 'edit_book',
          arguments: { book_id: 'b1', title: '不允许', book_list_ids: [] },
        })
      ).isError,
      true,
    );
    assert.equal(
      (
        await client.callTool({
          name: 'edit_book',
          arguments: { book_id: 'b1', book_list_ids: ['missing'] },
        })
      ).isError,
      true,
    );
    const oldState = await readPersistedState();
    assert.equal(
      (await call('edit_book', { book_id: 'b1', book_list_ids: ['l1'] })).book.bookLists[0].id,
      'l1',
    );
    await writePersistedState(oldState);
    assert.deepEqual((await call('list_book_list')).items[0].bookIds, ['b1']);
    const list = (await call('list_book_list')).items[0];
    assert.equal(
      (
        await call('edit_book_list', {
          book_list_id: 'l1',
          expected_updated_at: list.updatedAt,
          name: '新书单',
          note: '说明',
        })
      ).bookList.name,
      '新书单',
    );
    assert.equal(
      (
        await client.callTool({
          name: 'edit_book_list',
          arguments: { book_list_id: 'l1', expected_updated_at: list.updatedAt, name: '覆盖' },
        })
      ).isError,
      true,
    );
    assert.equal(
      (await call('list_book_highlight_and_comment', { book_id: 'b1' })).items[0].comment,
      '见解',
    );
    const note = (await call('read_book_note', { book_id: 'b1', offset: 1, limit: 3 })).notes[0];
    assert.equal(note.content, 'bcd');
    assert.equal(note.nextOffset, 4);
    const fixture = await readFile(
      new URL('../../../tests/fixtures/openapi-sample.epub', import.meta.url),
    );
    assert.equal(
      (
        await call('upload_book', {
          file_name: 'sample.epub',
          epub_base64: fixture.toString('base64'),
        })
      ).book.title,
      '接口测试书籍',
    );
    assert.equal(
      (await client.callTool({ name: 'upload_book', arguments: { file_path: '/tmp/book.epub' } }))
        .isError,
      true,
    );
    assert.equal(
      (
        await client.callTool({
          name: 'upload_book',
          arguments: { file_name: 'bad.epub', epub_base64: 'invalid=' },
        })
      ).isError,
      true,
    );
    await call('trash_book', { book_id: 'b1' });
    assert.equal(
      (await call('list_book')).items.some((book) => book.id === 'b1'),
      false,
    );
    assert.equal((await readPersistedState()).state.trashedBooks[0].book.id, 'b1');
    assert.equal(
      (await client.callTool({ name: 'read_book_note', arguments: { book_id: 'b1' } })).isError,
      true,
    );
    await app.request(tokenPath, {
      method: 'DELETE',
      headers: { 'X-Learning-Center-Request': '1' },
    });
    await assert.rejects(client.callTool({ name: 'list_book', arguments: {} }));
  } finally {
    await client.close();
    http.closeAllConnections();
    await new Promise((resolve) => http.close(resolve));
  }
});
