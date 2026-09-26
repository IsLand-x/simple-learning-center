import { createRouter } from '../app/router.js';
import { readSystemInfo } from '../app/systemInfo.js';
import { methodNotAllowed } from '../app/http.js';

export function createSystemInfoRoutes() {
  const app = createRouter();
  app.get('/', (c) => c.json(readSystemInfo()));
  app.all('/', methodNotAllowed);
  return app;
}
