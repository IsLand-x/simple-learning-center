import type { AppDependencies } from '../../dependencies.js';
import type { ServerApp } from '../../http/router.js';
import { getCookie } from 'hono/cookie';
import { SESSION_COOKIE_NAME } from './service.js';

const PUBLIC_AUTH_PATHS = new Set(['/api/auth/login', '/api/auth/logout', '/api/auth/session']);

export function registerAuthenticationMiddleware(
  app: ServerApp,
  { auth, mode, openApiTokens }: Pick<AppDependencies, 'auth' | 'mode' | 'openApiTokens'>,
) {
  app.use('/api/*', async (c, next) => {
    if (c.req.path.startsWith('/api/openapi/')) {
      if (await openApiTokens.verify(c.req.header('authorization'))) return next();
      c.header('WWW-Authenticate', 'Bearer');
      return c.json({ error: 'OpenAPI Token 无效或未配置' }, 401);
    }
    if (mode !== 'remote' || PUBLIC_AUTH_PATHS.has(c.req.path)) return next();
    if (await auth.verifySession(getCookie(c, SESSION_COOKIE_NAME))) return next();
    return c.json({ error: '登录状态已失效，请重新登录' }, 401);
  });
}
