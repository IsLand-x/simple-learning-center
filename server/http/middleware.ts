import type { ServerApp } from './router.js';

export function registerApiHeaders(app: ServerApp) {
  app.use('/api/*', async (c, next) => {
    await next();
    if (!c.res.headers.has('Cache-Control')) c.header('Cache-Control', 'no-store');
    c.header('X-Content-Type-Options', 'nosniff');
  });
}
