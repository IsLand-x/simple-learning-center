import { createDependencies } from './app/dependencies.js';
import type { AppOptions } from './app/dependencies.js';
import { registerErrorHandler } from './app/http.js';
import { registerApiMiddleware } from './app/middleware.js';
import { createRouter } from './app/router.js';
import { createAiOAuthRoutes } from './routes/aiOAuthRoutes.js';
import { createAiRoutes } from './routes/aiRoutes.js';
import { createAuthRoutes } from './routes/authRoutes.js';
import { createBookRoutes } from './routes/bookRoutes.js';
import { createHealthRoutes } from './routes/healthRoutes.js';
import { createMcpRoutes } from './routes/mcpRoutes.js';
import { createOpenApiRoutes } from './routes/openApiRoutes.js';
import {
  createRssArticleRoutes,
  createRssDigestRoutes,
  createRssFeedRoutes,
} from './routes/rssRoutes.js';
import { createSearchIndexRoutes } from './routes/searchIndexRoutes.js';
import { createSourceCredentialRoutes } from './routes/sourceCredentialRoutes.js';
import { createStateRoutes } from './routes/stateRoutes.js';
import { createStaticRoutes } from './routes/staticRoutes.js';
import { createSystemInfoRoutes } from './routes/systemInfoRoutes.js';
import { createVideoRoutes } from './routes/videoRoutes.js';

export function createApp({ serveFrontend = true, ...options }: AppOptions = {}) {
  const app = createRouter();
  const dependencies = createDependencies(options);

  // Keep authorization, route, method fallback and static fallback order stable.
  registerApiMiddleware(app, dependencies);
  app.route('/', createOpenApiRoutes(dependencies));
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
