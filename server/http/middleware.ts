import { collectServerTiming } from '../infrastructure/http/timing.js';
import type { ServerApp } from './router.js';
import { isVersionedAssetPath } from './staticAsset.js';

export function registerApiHeaders(app: ServerApp) {
  app.use('/api/*', async (c, next) => {
    const timing = await collectServerTiming(next);
    c.header('Server-Timing', timing);
    if (!c.res.headers.has('Cache-Control')) c.header('Cache-Control', 'no-store');
    c.header('X-Content-Type-Options', 'nosniff');
  });
}

// The CDN overwrites this header on every origin request, including cache misses.
// Reject non-assets before auth/public routes so the static host cannot proxy user data.
export function registerStaticOriginGuard(app: ServerApp) {
  app.use('*', async (c, next) => {
    if (c.req.header('X-Learning-Center-Static-Only') === '1') {
      if (!['GET', 'HEAD'].includes(c.req.method) || !isVersionedAssetPath(c.req.path)) {
        c.header('Cache-Control', 'no-store');
        return c.notFound();
      }
    }
    await next();
  });
}
