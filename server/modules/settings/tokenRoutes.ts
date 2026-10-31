import type { AppDependencies } from '../../dependencies.js';
import { isSameOriginRequest } from '../../http/middleware.js';
import { createRouter } from '../../http/router.js';
import { methodNotAllowed } from '../../http/responses.js';

export function createOpenApiTokenRoutes({
  openApiTokens,
}: Pick<AppDependencies, 'openApiTokens'>) {
  const app = createRouter();
  const tokenPath = '/api/settings/openapi-token';
  app.use(`${tokenPath}*`, async (c, next) => {
    if (!isSameOriginRequest(c.req.header('origin'), c.req.url, c.req.header('sec-fetch-site')))
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
  return app;
}
