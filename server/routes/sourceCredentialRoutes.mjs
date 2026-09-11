import { MAX_SOURCE_CREDENTIALS_REQUEST_BYTES } from '../config.mjs';
import { readJsonRequest } from '../storage.mjs';
import { methodNotAllowed } from '../app/http.mjs';

export function registerSourceCredentialRoutes(app, { sourceSecrets }) {
  app.get('/api/source-credentials/bilibili', async (c) =>
    c.json(await sourceSecrets.getBilibiliStatus()),
  );
  app.put('/api/source-credentials/bilibili', async (c) => {
    const payload = await readJsonRequest(c.req.raw, MAX_SOURCE_CREDENTIALS_REQUEST_BYTES);
    return c.json(await sourceSecrets.setBilibiliCookie(payload?.cookie));
  });
  app.post('/api/source-credentials/bilibili/verify', async (c) =>
    c.json(await sourceSecrets.verifyBilibiliCookie()),
  );
  app.delete('/api/source-credentials/bilibili', async (c) =>
    c.json(await sourceSecrets.deleteBilibiliCookie()),
  );
  app.all('/api/source-credentials/bilibili', methodNotAllowed);
  app.all('/api/source-credentials/bilibili/verify', methodNotAllowed);
}
