import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { HTTPException } from 'hono/http-exception';
import { streamSSE } from 'hono/streaming';
import { rm } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { createApiKeyExport, importApiKeys, parseApiKeyImport } from './apiKeys.mjs';
import { createAiJobManager } from './aiJobs.mjs';
import { fetchRssFeed } from './rss.mjs';
import { fetchRssArticle } from './rssArticle.mjs';
import { fetchYouTubeVideo } from './youtubeVideo.mjs';
import { protectServerRssState } from './rssScheduler.mjs';
import {
  createAuthService,
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
} from './auth.mjs';
import {
  AUTH_FILE,
  DIST_DIRECTORY,
  MAX_AUTH_REQUEST_BYTES,
  MAX_AI_JOB_REQUEST_BYTES,
  MAX_API_KEY_IMPORT_BYTES,
  MAX_BOOK_BYTES,
  MAX_INDEX_BYTES,
  MAX_RSS_REQUEST_BYTES,
  MAX_STATE_BYTES,
  MAX_VIDEO_REQUEST_BYTES,
  MODE,
  PASSWORD,
  STATE_FILE,
  USERNAME,
} from './config.mjs';
import { statusError } from './errors.mjs';
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
const AI_STREAM_UPDATE_INTERVAL_MS = 32;

function noContent(c) {
  return c.body(null, 204);
}

function methodNotAllowed(c) {
  return c.json({ error: '不支持的请求方法' }, 405);
}

function validatePassword(value, label = '密码') {
  if (typeof value !== 'string' || value.length < 8 || value.length > 128) {
    throw statusError(400, `${label}长度必须为 8 到 128 个字符`);
  }
  return value;
}

function createLoginLimiter() {
  const attempts = new Map();
  const windowMilliseconds = 60_000;
  const maxFailures = 5;

  return {
    check(key) {
      const entry = attempts.get(key);
      if (!entry || entry.resetAt <= Date.now()) {
        attempts.delete(key);
        return 0;
      }
      return entry.failures >= maxFailures ? Math.ceil((entry.resetAt - Date.now()) / 1000) : 0;
    },
    fail(key) {
      const now = Date.now();
      const previous = attempts.get(key);
      const entry = !previous || previous.resetAt <= now
        ? { failures: 1, resetAt: now + windowMilliseconds }
        : { ...previous, failures: previous.failures + 1 };
      attempts.set(key, entry);
      return entry.failures >= maxFailures ? Math.ceil((entry.resetAt - now) / 1000) : 0;
    },
    clear(key) {
      attempts.delete(key);
    },
  };
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
  authFile = AUTH_FILE,
  aiJobRunner,
  rssFetcher = fetchRssFeed,
  rssArticleFetcher = fetchRssArticle,
  youtubeVideoFetcher = fetchYouTubeVideo,
  aiJobManager,
} = {}) {
  const app = new Hono();
  const auth = createAuthService({
    authFile,
    defaultUsername: username,
    defaultPassword: password,
  });
  const loginLimiter = createLoginLimiter();
  const aiJobs = aiJobManager || createAiJobManager({ runChat: aiJobRunner });
  const publicAuthPaths = new Set([
    '/api/auth/login',
    '/api/auth/logout',
    '/api/auth/session',
  ]);

  app.use('/api/*', async (c, next) => {
    await next();
    c.header('Cache-Control', 'no-store');
    c.header('X-Content-Type-Options', 'nosniff');
  });

  app.use('/api/*', async (c, next) => {
    if (mode !== 'remote' || publicAuthPaths.has(c.req.path)) return next();
    if (await auth.verifySession(getCookie(c, SESSION_COOKIE_NAME))) return next();
    return c.json({ error: '登录状态已失效，请重新登录' }, 401);
  });

  app.get('/api/auth/session', async (c) => {
    const authenticated = mode !== 'remote'
      || await auth.verifySession(getCookie(c, SESSION_COOKIE_NAME));
    return c.json({
      authenticated,
      mode,
      username: authenticated
        ? (mode === 'remote' ? await auth.getUsername() : await auth.getConfiguredUsername())
        : null,
    });
  });
  app.post('/api/auth/login', async (c) => {
    const clientAddress = c.req.header('x-real-ip')
      || c.env?.incoming?.socket?.remoteAddress
      || 'unknown';
    const retryAfter = loginLimiter.check(clientAddress);
    if (retryAfter) {
      c.header('Retry-After', String(retryAfter));
      return c.json({ error: `登录尝试过于频繁，请在 ${retryAfter} 秒后重试` }, 429);
    }
    const payload = await readJsonRequest(c.req.raw, MAX_AUTH_REQUEST_BYTES);
    const submittedUsername = typeof payload?.username === 'string' ? payload.username.trim() : '';
    const submittedPassword = typeof payload?.password === 'string' ? payload.password : '';
    if (
      !submittedUsername
      || submittedUsername.length > 64
      || !submittedPassword
      || submittedPassword.length > 128
    ) {
      loginLimiter.fail(clientAddress);
      return c.json({ error: '账号或密码不正确' }, 401);
    }
    const token = await auth.login(submittedUsername, submittedPassword);
    if (!token) {
      const blockedFor = loginLimiter.fail(clientAddress);
      if (blockedFor) c.header('Retry-After', String(blockedFor));
      return c.json({ error: '账号或密码不正确' }, 401);
    }
    loginLimiter.clear(clientAddress);
    setCookie(c, SESSION_COOKIE_NAME, token, sessionCookieOptions);
    return c.json({ username: await auth.getUsername() });
  });
  app.post('/api/auth/logout', (c) => {
    deleteCookie(c, SESSION_COOKIE_NAME, { path: '/', secure: true });
    return noContent(c);
  });
  app.put('/api/auth/credentials', async (c) => {
    const payload = await readJsonRequest(c.req.raw, MAX_AUTH_REQUEST_BYTES);
    const next = await auth.updatePassword(validatePassword(payload?.password, '新密码'));
    setCookie(c, SESSION_COOKIE_NAME, next.token, sessionCookieOptions);
    return c.json({ username: next.username });
  });
  app.all('/api/auth/session', methodNotAllowed);
  app.all('/api/auth/login', methodNotAllowed);
  app.all('/api/auth/logout', methodNotAllowed);
  app.all('/api/auth/credentials', methodNotAllowed);

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
    const initializeOnly = c.req.query('initialize') === '1';
    await writePersistedState(
      state,
      initializeOnly,
      initializeOnly ? undefined : async (incomingState, currentState) => protectServerRssState(
        await aiJobs.protectPersistedState(incomingState),
        currentState,
      ),
    );
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

  app.post('/api/rss/fetch', async (c) => {
    const payload = await readJsonRequest(c.req.raw, MAX_RSS_REQUEST_BYTES);
    return c.json(await rssFetcher(payload?.url));
  });
  app.all('/api/rss/fetch', methodNotAllowed);

  app.post('/api/rss/article', async (c) => {
    const payload = await readJsonRequest(c.req.raw, MAX_RSS_REQUEST_BYTES);
    const persistedState = await readPersistedState();
    return c.json(await rssArticleFetcher(payload?.url, {
      readerConfig: persistedState?.state?.webSearchConfig,
    }));
  });
  app.all('/api/rss/article', methodNotAllowed);

  app.post('/api/rss/digests/run', async (c) => {
    const payload = await readJsonRequest(c.req.raw, MAX_RSS_REQUEST_BYTES);
    const result = await aiJobs.startDigest({
      date: payload?.date,
      force: payload?.force !== false,
      trigger: 'manual',
    });
    return c.json(result, result.job ? 202 : 200);
  });
  app.all('/api/rss/digests/run', methodNotAllowed);

  app.post('/api/videos/import', async (c) => {
    const payload = await readJsonRequest(c.req.raw, MAX_VIDEO_REQUEST_BYTES);
    return c.json(await youtubeVideoFetcher(payload?.url));
  });
  app.all('/api/videos/import', methodNotAllowed);

  app.post('/api/ai/jobs', async (c) => {
    const payload = await readJsonRequest(c.req.raw, MAX_AI_JOB_REQUEST_BYTES);
    return c.json(await aiJobs.start(payload), 202);
  });
  app.get('/api/ai/jobs', (c) => c.json({
    jobs: aiJobs.list({
      bookId: c.req.query('bookId'),
      conversationId: c.req.query('conversationId'),
    }),
  }));
  app.get('/api/ai/jobs/:jobId/events', (c) => {
    const jobId = c.req.param('jobId');
    aiJobs.get(jobId);
    c.header('X-Accel-Buffering', 'no');
    return streamSSE(c, async (stream) => {
      let latestJob;
      let wake;
      let stopped = false;
      const notify = () => {
        wake?.();
        wake = undefined;
      };
      const unsubscribe = aiJobs.subscribe(jobId, (job) => {
        latestJob = job;
        notify();
      });
      stream.onAbort(() => {
        stopped = true;
        notify();
      });
      try {
        while (!stopped) {
          if (!latestJob) {
            await new Promise((resolve) => {
              wake = resolve;
            });
          }
          const job = latestJob;
          latestJob = undefined;
          if (!job || stopped) continue;
          await stream.writeSSE({
            event: 'job',
            id: String(job.revision),
            data: JSON.stringify(job),
          });
          if (!['queued', 'running'].includes(job.status)) return;
          await stream.sleep(AI_STREAM_UPDATE_INTERVAL_MS);
        }
      } finally {
        unsubscribe();
      }
    });
  });
  app.get('/api/ai/jobs/:jobId', (c) => c.json(aiJobs.get(c.req.param('jobId'))));
  app.delete('/api/ai/jobs/:jobId', (c) => c.json(aiJobs.cancel(c.req.param('jobId'))));
  app.all('/api/ai/jobs', methodNotAllowed);
  app.all('/api/ai/jobs/:jobId', methodNotAllowed);

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
