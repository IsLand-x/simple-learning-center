import { createRouter } from '../../http/router.js';
import { readJsonRequest } from '../../http/body.js';
import { methodNotAllowed } from '../../http/responses.js';
import { statusError } from '../../infrastructure/http/errors.js';
import { discoverModels } from './modelDiscovery.js';

export function createAiModelRoutes() {
  const app = createRouter();
  app.post('/discover', async (c) => {
    const origin = c.req.header('origin');
    let sameHost = !origin;
    try {
      if (origin) sameHost = new URL(origin).host === new URL(c.req.url).host;
    } catch {
      sameHost = false;
    }
    if (!sameHost || c.req.header('sec-fetch-site') === 'cross-site') {
      throw statusError(403, '请从学习中心设置页面检测模型');
    }
    if (c.req.header('content-type')?.split(';')[0].trim() !== 'application/json') {
      throw statusError(415, '模型检测请求必须使用 JSON');
    }
    const payload = await readJsonRequest<unknown>(c.req.raw, 24 * 1024);
    return c.json(await discoverModels(payload, c.req.raw.signal));
  });
  app.all('/discover', methodNotAllowed);
  return app;
}
