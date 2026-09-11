import { createApiKeyExport, importApiKeys, parseApiKeyImport } from '../apiKeys.mjs';
import { MAX_API_KEY_IMPORT_BYTES } from '../config.mjs';
import { readJsonRequest, readPersistedState } from '../storage.mjs';
import { methodNotAllowed } from '../app/http.mjs';

export function registerApiKeyRoutes(app) {
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
}
