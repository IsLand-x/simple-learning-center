import type { AppDependencies } from '../app/dependencies.js';
import { createRouter } from '../app/router.js';
import { statusError } from '../infrastructure/http/errors.js';

export function createAiOAuthRoutes({ oauth }: Pick<AppDependencies, 'oauth'>) {
  const app = createRouter();
  app.use('/*', async (c, next) => {
    const origin = c.req.header('origin');
    let sameHost;
    try {
      sameHost = !origin || new URL(origin).host === new URL(c.req.url).host;
    } catch {
      sameHost = false;
    }
    // HTTPS can terminate at the reverse proxy, so compare hosts, as other settings routes do.
    if (
      !sameHost ||
      c.req.header('sec-fetch-site') === 'cross-site' ||
      (c.req.method !== 'GET' && c.req.header('x-learning-center-oauth') !== '1')
    ) {
      throw statusError(403, '请从学习中心设置页面操作 OAuth 登录');
    }
    await next();
  });
  app.get('/providers', async (c) => c.json(await oauth.list()));
  app.post('/:provider/login', async (c) => c.json(await oauth.start(c.req.param('provider'))));
  app.delete('/:provider/login', async (c) => {
    await oauth.cancel(c.req.param('provider'));
    return c.json(await oauth.status(c.req.param('provider')));
  });
  app.delete('/:provider', async (c) => c.json(await oauth.logout(c.req.param('provider'))));
  return app;
}
