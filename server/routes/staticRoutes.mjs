import { serveStatic } from '@hono/node-server/serve-static';
import { join } from 'node:path';
import { DIST_DIRECTORY } from '../config.mjs';
import { exists } from '../storage.mjs';
import { methodNotAllowed } from '../app/http.mjs';

export function registerStaticRoutes(app) {
  app.get('*', serveStatic({ root: DIST_DIRECTORY }));
  app.get('*', async (c, next) => {
    const indexPath = join(DIST_DIRECTORY, 'index.html');
    if (!(await exists(indexPath))) {
      return c.json({ error: '前端尚未构建，请先运行 npm run build' }, 503);
    }
    c.header('Cache-Control', 'no-cache');
    return serveStatic({ root: DIST_DIRECTORY, path: 'index.html' })(c, next);
  });
  app.all('*', methodNotAllowed);
}
