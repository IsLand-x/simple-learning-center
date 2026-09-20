import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { movePersistedBookToTrash } from '../bookTrash.mjs';
import { editBook, editBookList, libraryState, publicBook, requireBook } from './library.mjs';
import { statusError } from '../errors.mjs';
import { importBook } from '../openapi/importBook.mjs';

const id = z.string().trim().min(1).max(200);
const pagination = {
  offset: z.number().int().min(0).default(0),
  limit: z.number().int().min(1).max(100).default(50),
};
function page(items, { offset, limit }) {
  return {
    items: items.slice(offset, offset + limit),
    total: items.length,
    nextOffset: offset + limit < items.length ? offset + limit : null,
  };
}

export function createLibraryMcpServer() {
  const server = new McpServer({ name: 'learning-center', version: '1.0.0' });
  function tool(name, description, shape, readOnly, action, destructive = false) {
    server.registerTool(
      name,
      {
        description,
        inputSchema: z.object(shape).strict(),
        annotations: { readOnlyHint: readOnly, destructiveHint: destructive, openWorldHint: false },
      },
      async (args) => {
        try {
          const result = await action(args);
          return {
            content: [{ type: 'text', text: JSON.stringify(result) }],
            structuredContent: result,
          };
        } catch (error) {
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: error.status && error.status < 500 ? error.message : '操作失败，请稍后重试',
              },
            ],
          };
        }
      },
    );
  }
  tool(
    'list_book',
    '列出书架中的书籍，包含名称、作者、阅读进度（0–100）及所属书单；不包含回收站。',
    pagination,
    true,
    async (args) => {
      const state = await libraryState();
      return page(
        (state.books || []).map((book) => publicBook(state, book)),
        args,
      );
    },
  );
  tool(
    'edit_book',
    '仅编辑书籍所属书单：book_list_ids 为完整的目标书单 ID 列表，空数组表示移出所有书单。不能修改标题、作者或进度。',
    { book_id: id, book_list_ids: z.array(id).max(500) },
    false,
    editBook,
    true,
  );
  tool(
    'list_book_highlight_and_comment',
    '列出指定书籍的高亮与评论，包括原文、位置和评论正文。',
    { book_id: id, ...pagination },
    true,
    async (args) => {
      const state = await libraryState();
      requireBook(state, args.book_id);
      return page(
        (state.highlights || []).filter((item) => item.bookId === args.book_id),
        args,
      );
    },
  );
  tool(
    'read_book_note',
    '读取指定书籍的 Markdown 阅读笔记；可指定 note_id，使用 offset/limit 分段读取正文，避免超长响应。',
    {
      book_id: id,
      note_id: id.optional(),
      offset: z.number().int().min(0).default(0),
      limit: z.number().int().min(1).max(20000).default(10000),
    },
    true,
    async ({ book_id, note_id, offset, limit }) => {
      const state = await libraryState(
        (note) => note.bookId === book_id && (!note_id || note.id === note_id),
      );
      requireBook(state, book_id);
      const notes = (state.notes || []).filter(
        (note) => note.bookId === book_id && (!note_id || note.id === note_id),
      );
      return {
        notes: notes.map((note) => ({
          id: note.id,
          title: note.title,
          updatedAt: note.updatedAt,
          content: note.content.slice(offset, offset + limit),
          totalLength: note.content.length,
          nextOffset: offset + limit < note.content.length ? offset + limit : null,
        })),
      };
    },
  );
  tool(
    'trash_book',
    '将书籍放入回收站，保留书籍文件、笔记、高亮和评论；可在应用内恢复，30 天后自动清理。',
    { book_id: id },
    false,
    async ({ book_id }) => {
      const result = await movePersistedBookToTrash(book_id);
      return { bookId: result.book.id, deletedAt: result.deletedAt };
    },
    true,
  );
  tool(
    'list_book_list',
    '列出书单，包含 ID、名称、说明、书籍 ID 和更新时间。',
    pagination,
    true,
    async (args) => page((await libraryState()).bookLists || [], args),
  );
  tool(
    'edit_book_list',
    '编辑已有书单的名称、说明或完整的书籍 ID 列表。先调用 list_book_list 获取 expected_updated_at，防止覆盖其他修改。',
    {
      book_list_id: id,
      expected_updated_at: z.number().int().min(0),
      name: z.string().trim().min(1).max(100).optional(),
      note: z.string().max(2000).optional(),
      book_ids: z.array(id).max(10000).optional(),
    },
    false,
    editBookList,
    true,
  );
  tool(
    'upload_book',
    '导入 EPUB。将文件二进制编码为 Base64 后传入 epub_base64（不带 data: 前缀），最多 10 MiB。较大文件请使用同一 Token 调用 POST /api/openapi/v1/books，Content-Type: application/epub+zip，正文直接传文件，最大 100 MiB。不能传入客户端本地路径：远程服务无法读取该路径。',
    {
      file_name: z
        .string()
        .min(1)
        .max(255)
        .refine(
          (value) =>
            /\.epub$/i.test(value) &&
            !/[/\\]/.test(value) &&
            !Array.from(value).some((char) => char.charCodeAt(0) < 32),
          '必须是有效的 EPUB 文件名',
        ),
      epub_base64: z
        .string()
        .min(4)
        .max(13981016)
        .regex(/^[A-Za-z0-9+/]*={0,2}$/),
    },
    false,
    async ({ file_name, epub_base64 }) => {
      const bytes = Buffer.from(epub_base64, 'base64');
      if (bytes.toString('base64') !== epub_base64) throw statusError(400, 'Base64 编码不正确');
      if (bytes.length > 10 * 1024 * 1024)
        throw statusError(413, '文件超过 10 MiB，请使用 HTTP 上传接口');
      return {
        book: await importBook(
          new Request('http://localhost/upload', { method: 'POST', body: bytes }),
          file_name,
        ),
      };
    },
  );
  return server;
}
