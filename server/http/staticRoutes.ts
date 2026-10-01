import { createRouter } from './router.js';
import { serveStatic } from '@hono/node-server/serve-static';
import { compress } from 'hono/compress';
import { join } from 'node:path';
import { DIST_DIRECTORY } from '../config.js';
import { exists } from '../infrastructure/fs/files.js';
import { methodNotAllowed } from './responses.js';

export function createStaticRoutes(directory = DIST_DIRECTORY) {
  const app = createRouter();
  app.use('*', compress());
  const serveAsset = serveStatic({ root: directory });
  app.get('*', async (c, next) => {
    const response = await serveAsset(c, next);
    if (response instanceof Response) {
      // Only versioned Vite assets are immutable; entry points must see new deployments.
      const versioned = /^\/assets\/.+-[\w-]{8,}\.[\w.]+$/.test(c.req.path);
      response.headers.set(
        'Cache-Control',
        versioned ? 'public, max-age=31536000, immutable' : 'no-cache',
      );
    }
    return response;
  });
  app.get('*', async (c, next) => {
    const indexPath = join(directory, 'index.html');
    if (!(await exists(indexPath))) {
      return c.json({ error: '前端尚未构建，请先运行 npm run build' }, 503);
    }
    c.header('Cache-Control', 'no-cache');
    return serveStatic({ root: directory, path: 'index.html' })(c, next);
  });
  app.all('*', methodNotAllowed);
  return app;
}
