import { createRouter } from '../../http/router.js';
import { readSystemInfo } from './systemInfo.js';
import { methodNotAllowed } from '../../http/responses.js';

export function createSystemInfoRoutes() {
  const app = createRouter();
  app.get('/', (c) => c.json(readSystemInfo()));
  app.all('/', methodNotAllowed);
  return app;
}
