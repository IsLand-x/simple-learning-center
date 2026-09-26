import { createRouter } from '../../http/router.js';
import { methodNotAllowed } from '../../http/responses.js';
import { importBook } from './import.js';

export function createBookImportRoutes() {
  const app = createRouter();
  app.post('/api/openapi/v1/books', async (c) => {
    if (c.req.header('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/epub+zip')
      return c.json({ error: '请使用 application/epub+zip 上传 EPUB 文件' }, 415);
    const fileName = c.req.query('filename') || '导入书籍.epub';
    if (
      fileName.length > 255 ||
      /[/\\]/.test(fileName) ||
      Array.from(fileName).some((char) => char.charCodeAt(0) < 32) ||
      !/\.epub$/i.test(fileName)
    )
      return c.json({ error: '文件名必须是有效的 .epub 文件名' }, 400);
    return c.json({ book: await importBook(c.req.raw, fileName) }, 201);
  });
  app.all('/api/openapi/v1/books', methodNotAllowed);
  return app;
}
