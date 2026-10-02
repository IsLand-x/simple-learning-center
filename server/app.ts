import { createDependencies } from './dependencies.js';
import type { AppOptions } from './dependencies.js';
import { registerErrorHandler } from './http/responses.js';
import { registerApiHeaders } from './http/middleware.js';
import { createRouter } from './http/router.js';
import { createAiOAuthRoutes } from './modules/ai/oauthRoutes.js';
import { createAiRoutes } from './modules/ai/routes.js';
import { createAuthRoutes } from './modules/auth/routes.js';
import { registerAuthenticationMiddleware } from './modules/auth/middleware.js';
import { createBookRoutes } from './modules/books/routes.js';
import { createBookImportRoutes } from './modules/books/importRoutes.js';
import { createHealthRoutes } from './http/healthRoutes.js';
import { createMcpRoutes } from './modules/books/mcpRoutes.js';
import { createOpenApiTokenRoutes } from './modules/settings/tokenRoutes.js';
import {
  createRssArticleRoutes,
  createRssDigestRoutes,
  createRssFeedRoutes,
} from './modules/rss/routes.js';
import { createSearchIndexRoutes } from './modules/books/searchRoutes.js';
import { createSourceCredentialRoutes } from './modules/settings/sourceCredentialRoutes.js';
import { createStateRoutes } from './modules/state/routes.js';
import { createStaticRoutes } from './http/staticRoutes.js';
import { createSystemInfoRoutes } from './modules/settings/systemInfoRoutes.js';
import { createVideoRoutes } from './modules/videos/routes.js';

export function createApp({ serveFrontend = true, ...options }: AppOptions = {}) {
  const app = createRouter();
  const dependencies = createDependencies(options);

  // Keep authorization, route, method fallback and static fallback order stable.
  registerApiHeaders(app);
  registerAuthenticationMiddleware(app, dependencies);
  app.route('/', createOpenApiTokenRoutes(dependencies));
  app.route('/', createBookImportRoutes());
  app.route('/api/openapi/mcp', createMcpRoutes());
  app.route('/api/auth', createAuthRoutes(dependencies));
  app.route('/api/health', createHealthRoutes(dependencies));
  app.route('/api/settings/system-info', createSystemInfoRoutes());
  app.route('/api/state', createStateRoutes(dependencies));
  app.route('/api/ai/oauth', createAiOAuthRoutes(dependencies));
  app.route('/api/rss', createRssFeedRoutes(dependencies));
  app.route('/api/source-credentials', createSourceCredentialRoutes(dependencies));
  app.route('/api/rss', createRssArticleRoutes(dependencies));
  app.route('/api/rss', createRssDigestRoutes(dependencies));
  app.route('/api/videos', createVideoRoutes(dependencies));
  app.route('/api/ai/jobs', createAiRoutes(dependencies));
  app.route('/api/books', createBookRoutes());
  app.route('/api/search-indexes', createSearchIndexRoutes());
  app.all('/api/*', (c) => c.json({ error: '接口不存在' }, 404));
  if (serveFrontend) app.route('/', createStaticRoutes());
  registerErrorHandler(app);
  return app;
}
