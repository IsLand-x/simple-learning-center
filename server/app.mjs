import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { basicAuth } from 'hono/basic-auth';
import { HTTPException } from 'hono/http-exception';
import { rm } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { createApiKeyExport, importApiKeys, parseApiKeyImport } from './apiKeys.mjs';
import {
  DIST_DIRECTORY,
  MAX_API_KEY_IMPORT_BYTES,
  MAX_BOOK_BYTES,
  MAX_INDEX_BYTES,
  MAX_STATE_BYTES,
  MODE,
  PASSWORD,
  STATE_FILE,
  USERNAME,
} from './config.mjs';
import {
  atomicWrite,
  bookPath,
  exists,
  fileResponse,
  noteDirectoryPath,
  readJsonRequest,
  readPersistedState,
  searchIndexPath,
  writePersistedState,
  writeRequestToFile,
} from './storage.mjs';

const MIME_TYPES = new Map([
  ['.epub', 'application/epub+zip'],
  ['.json', 'application/json; charset=utf-8'],
]);

function noContent(c) {
  return c.body(null, 204);
}

function methodNotAllowed(c) {
  return c.json({ error: '不支持的请求方法' }, 405);
}

async function storedFileResponse(c, path) {
  if (!await exists(path)) return c.json({ error: '文件不存在' }, 404);
  const response = await fileResponse(path, c.req.method);
  if (!response) return c.json({ error: '文件不存在' }, 404);
  response.headers.set(
    'Content-Type',
    MIME_TYPES.get(extname(path).toLowerCase()) || 'application/octet-stream',
  );
  return response;
}

export function createApp({
  mode = MODE,
  username = USERNAME,
  password = PASSWORD,
  serveFrontend = true,
} = {}) {
  const app = new Hono();

  app.use('/api/*', async (c, next) => {
    await next();
    c.header('Cache-Control', 'no-store');
    c.header('X-Content-Type-Options', 'nosniff');
  });

  if (mode === 'remote') {
    app.use('*', basicAuth({
      username,
      password,
      realm: 'Learning Center',
      invalidUserMessage: (c) => (
        c.req.path.startsWith('/api/')
          ? { error: '需要登录后访问学习中心' }
          : '需要登录后访问学习中心'
      ),
    }));
  }

  app.get('/api/health', async (c) => c.json({
    initialized: await exists(STATE_FILE),
    mode,
  }));
  app.all('/api/health', methodNotAllowed);

  app.get('/api/state', async (c) => {
    const state = await readPersistedState();
    return state ? c.json(state) : noContent(c);
  });
  app.put('/api/state', async (c) => {
    const state = await readJsonRequest(c.req.raw, MAX_STATE_BYTES);
    await writePersistedState(state, c.req.query('initialize') === '1');
    return noContent(c);
  });
  app.all('/api/state', methodNotAllowed);

  app.get('/api/api-keys/export', async (c) => {
    const state = await readPersistedState();
    if (!state) return c.json({ error: '服务端尚未初始化，无法导出 API Key' }, 409);
    const payload = `${JSON.stringify(createApiKeyExport(state), null, 2)}\n`;
    const date = new Date().toISOString().slice(0, 10);
    return c.body(payload, 200, {
      'Content-Disposition': `attachment; filename="learning-center-api-keys-${date}.json"`,
      'Content-Type': 'application/json; charset=utf-8',
    });
  });
  app.put('/api/api-keys/import', async (c) => {
    const payload = await readJsonRequest(c.req.raw, MAX_API_KEY_IMPORT_BYTES);
    const imported = parseApiKeyImport(payload);
    return c.json(await importApiKeys(imported));
  });
  app.all('/api/api-keys/export', methodNotAllowed);
  app.all('/api/api-keys/import', methodNotAllowed);

  const bookRoute = '/api/books/:bookId';
  app.on(['GET', 'HEAD'], bookRoute, async (c) => {
    const path = bookPath(c.req.param('bookId'));
    if (!await exists(path)) return c.json({ error: '书籍文件不存在' }, 404);
    return storedFileResponse(c, path);
  });
  app.put(bookRoute, async (c) => {
    await writeRequestToFile(c.env.incoming, bookPath(c.req.param('bookId')), MAX_BOOK_BYTES);
    return noContent(c);
  });
  app.delete(bookRoute, async (c) => {
    const bookId = c.req.param('bookId');
    await Promise.all([
      rm(bookPath(bookId), { force: true }),
      rm(searchIndexPath(bookId), { force: true }),
      rm(noteDirectoryPath(bookId), { force: true, recursive: true }),
    ]);
    return noContent(c);
  });
  app.all(bookRoute, methodNotAllowed);

  const searchIndexRoute = '/api/search-indexes/:bookId';
  app.get(searchIndexRoute, async (c) => {
    const path = searchIndexPath(c.req.param('bookId'));
    if (!await exists(path)) return c.json({ error: '书内索引不存在' }, 404);
    return storedFileResponse(c, path);
  });
  app.put(searchIndexRoute, async (c) => {
    const index = await readJsonRequest(c.req.raw, MAX_INDEX_BYTES);
    await atomicWrite(searchIndexPath(c.req.param('bookId')), `${JSON.stringify(index)}\n`);
    return noContent(c);
  });
  app.delete(searchIndexRoute, async (c) => {
    await rm(searchIndexPath(c.req.param('bookId')), { force: true });
    return noContent(c);
  });
  app.all(searchIndexRoute, methodNotAllowed);

  app.all('/api/*', (c) => c.json({ error: '接口不存在' }, 404));

  if (serveFrontend) {
    app.get('*', serveStatic({ root: DIST_DIRECTORY }));
    app.get('*', async (c, next) => {
      const indexPath = join(DIST_DIRECTORY, 'index.html');
      if (!await exists(indexPath)) {
        return c.json({ error: '前端尚未构建，请先运行 npm run build' }, 503);
      }
      c.header('Cache-Control', 'no-cache');
      return serveStatic({ root: DIST_DIRECTORY, path: 'index.html' })(c, next);
    });
    app.all('*', methodNotAllowed);
  }

  app.onError((error, c) => {
    if (error instanceof HTTPException) return error.getResponse();
    const requestedStatus = Number.isInteger(error?.status) ? error.status : 500;
    const status = requestedStatus >= 400 && requestedStatus <= 599 ? requestedStatus : 500;
    if (status >= 500) console.error(error);
    const message = status >= 500
      ? '服务器处理失败'
      : error instanceof Error ? error.message : '请求处理失败';
    if (c.req.path.startsWith('/api/')) return c.json({ error: message }, status);
    return c.text(message, status);
  });

  return app;
}
