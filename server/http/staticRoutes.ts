import { createRouter } from './router.js';
import { serveStatic } from '@hono/node-server/serve-static';
import { compress } from 'hono/compress';
import { join } from 'node:path';
import { DIST_DIRECTORY } from '../config.js';
import { exists } from '../infrastructure/fs/files.js';
import { methodNotAllowed } from './responses.js';
import { isVersionedAssetPath } from './staticAsset.js';

export function createStaticRoutes(directory = DIST_DIRECTORY) {
  const app = createRouter();
  app.use('*', compress());
  const serveAsset = serveStatic({ root: directory });
  app.get('*', async (c, next) => {
    const response = await serveAsset(c, next);
    if (response instanceof Response) {
      // Only versioned Vite assets are immutable; entry points must see new deployments.
      const versioned = isVersionedAssetPath(c.req.path);
      if (versioned) response.headers.set('Access-Control-Allow-Origin', '*');
      response.headers.set(
        'Cache-Control',
        versioned ? 'public, max-age=31536000, immutable' : 'no-cache',
      );
    }
    return response;
  });
  app.get('*', async (c, next) => {
    if (c.req.path.startsWith('/assets/')) {
      c.header('Cache-Control', 'no-store');
      return c.notFound();
    }
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
