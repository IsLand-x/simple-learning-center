import { createRouter } from './router.js';
import { serveStatic } from '@hono/node-server/serve-static';
import { join } from 'node:path';
import { DIST_DIRECTORY } from '../config.js';
import { exists } from '../infrastructure/fs/files.js';
import { methodNotAllowed } from './responses.js';

export function createStaticRoutes() {
  const app = createRouter();
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
  return app;
}
