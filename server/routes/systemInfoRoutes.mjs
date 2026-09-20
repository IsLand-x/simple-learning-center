import { readSystemInfo } from '../app/systemInfo.mjs';
import { methodNotAllowed } from '../app/http.mjs';

export function registerSystemInfoRoutes(app) {
  app.get('/api/settings/system-info', (c) => c.json(readSystemInfo()));
  app.all('/api/settings/system-info', methodNotAllowed);
}
