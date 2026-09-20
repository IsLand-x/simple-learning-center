import { importBook } from '../openapi/importBook.mjs';
import { methodNotAllowed } from '../app/http.mjs';

export function registerOpenApiRoutes(app, { openApiTokens }) {
  const tokenPath = '/api/settings/openapi-token';
  app.use(`${tokenPath}*`, async (c, next) => {
    const origin = c.req.header('origin');
    let sameHost;
    try {
      sameHost = !origin || new URL(origin).host === new URL(c.req.url).host;
    } catch {
      sameHost = false;
    }
    // TLS may terminate at the reverse proxy; compare hosts rather than its internal scheme.
    if (!sameHost || c.req.header('sec-fetch-site') === 'cross-site')
      return c.json({ error: '不允许跨站管理 Token' }, 403);
    if (c.req.method !== 'GET' && c.req.header('x-learning-center-request') !== '1')
      return c.json({ error: '缺少设置请求标识' }, 403);
    return next();
  });
  app.get(`${tokenPath}/mcp`, async (c) => c.json(await openApiTokens.reveal()));
  app.get(tokenPath, async (c) => c.json(await openApiTokens.status()));
  app.post(tokenPath, async (c) => c.json(await openApiTokens.rotate()));
  app.delete(tokenPath, async (c) => c.json(await openApiTokens.revoke()));
  app.all(tokenPath, methodNotAllowed);
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
}
