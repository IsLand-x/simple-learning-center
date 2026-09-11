import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { SESSION_COOKIE_NAME, sessionCookieOptions } from '../auth.mjs';
import { MAX_AUTH_REQUEST_BYTES } from '../config.mjs';
import { statusError } from '../errors.mjs';
import { readJsonRequest } from '../storage.mjs';
import { methodNotAllowed, noContent } from '../app/http.mjs';

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
      const entry =
        !previous || previous.resetAt <= now
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

export function registerAuthRoutes(app, { auth, mode }) {
  const loginLimiter = createLoginLimiter();

  app.get('/api/auth/session', async (c) => {
    const authenticated =
      mode !== 'remote' || (await auth.verifySession(getCookie(c, SESSION_COOKIE_NAME)));
    return c.json({
      authenticated,
      mode,
      username: authenticated
        ? mode === 'remote'
          ? await auth.getUsername()
          : await auth.getConfiguredUsername()
        : null,
    });
  });
  app.post('/api/auth/login', async (c) => {
    const clientAddress =
      c.req.header('x-real-ip') || c.env?.incoming?.socket?.remoteAddress || 'unknown';
    const retryAfter = loginLimiter.check(clientAddress);
    if (retryAfter) {
      c.header('Retry-After', String(retryAfter));
      return c.json({ error: `登录尝试过于频繁，请在 ${retryAfter} 秒后重试` }, 429);
    }
    const payload = await readJsonRequest(c.req.raw, MAX_AUTH_REQUEST_BYTES);
    const submittedUsername = typeof payload?.username === 'string' ? payload.username.trim() : '';
    const submittedPassword = typeof payload?.password === 'string' ? payload.password : '';
    if (
      !submittedUsername ||
      submittedUsername.length > 64 ||
      !submittedPassword ||
      submittedPassword.length > 128
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
}
