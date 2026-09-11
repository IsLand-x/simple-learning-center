import { getCookie } from 'hono/cookie';
import { SESSION_COOKIE_NAME } from '../auth.mjs';

const PUBLIC_AUTH_PATHS = new Set(['/api/auth/login', '/api/auth/logout', '/api/auth/session']);

export function registerApiMiddleware(app, { auth, mode }) {
  app.use('/api/*', async (c, next) => {
    await next();
    if (!c.res.headers.has('Cache-Control')) c.header('Cache-Control', 'no-store');
    c.header('X-Content-Type-Options', 'nosniff');
  });

  app.use('/api/*', async (c, next) => {
    if (mode !== 'remote' || PUBLIC_AUTH_PATHS.has(c.req.path)) return next();
    if (await auth.verifySession(getCookie(c, SESSION_COOKIE_NAME))) return next();
    return c.json({ error: '登录状态已失效，请重新登录' }, 401);
  });
}
