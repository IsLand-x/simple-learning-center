import type { AppDependencies } from '../app/dependencies.js';
import { createRouter } from '../app/router.js';
import { MAX_SOURCE_CREDENTIALS_REQUEST_BYTES } from '../config.js';
import { readJsonRequest } from '../app/body.js';
import { methodNotAllowed } from '../app/http.js';

export function createSourceCredentialRoutes({
  sourceSecrets,
}: Pick<AppDependencies, 'sourceSecrets'>) {
  const app = createRouter();
  app.get('/bilibili', async (c) => c.json(await sourceSecrets.getBilibiliStatus()));
  app.put('/bilibili', async (c) => {
    const payload = await readJsonRequest(c.req.raw, MAX_SOURCE_CREDENTIALS_REQUEST_BYTES);
    return c.json(await sourceSecrets.setBilibiliCookie(payload?.cookie));
  });
  app.post('/bilibili/verify', async (c) => c.json(await sourceSecrets.verifyBilibiliCookie()));
  app.delete('/bilibili', async (c) => c.json(await sourceSecrets.deleteBilibiliCookie()));
  app.all('/bilibili', methodNotAllowed);
  app.all('/bilibili/verify', methodNotAllowed);
  return app;
}
