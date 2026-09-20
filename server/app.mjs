import { oauthService } from './aiAuth/service.mjs';
import { registerAiOAuthRoutes } from './routes/aiOAuthRoutes.mjs';
import { join } from 'node:path';
import { DATA_DIRECTORY } from './config.mjs';
import { createOpenApiTokenService } from './openapi/token.mjs';
import { registerOpenApiRoutes } from './routes/openApiRoutes.mjs';
import { registerMcpRoutes } from './routes/mcpRoutes.mjs';
import { Hono } from 'hono';
import { createAiJobManager } from './aiJobs.mjs';
import { createAuthService } from './auth.mjs';
import {
  AUTH_FILE,
  MODE,
  PASSWORD,
  USERNAME,
} from './config.mjs';
import { fetchRssFeed } from './rss.mjs';
import { fetchRssArticle } from './rssArticle.mjs';
import { fetchRssSource, resolveRssSource } from './rssSources.mjs';
import { sourceSecretsService } from './sourceSecrets.mjs';
import { fetchYouTubeVideo } from './youtubeVideo.mjs';
import { registerErrorHandler } from './app/http.mjs';
import { registerApiMiddleware } from './app/middleware.mjs';
import { registerAiRoutes } from './routes/aiRoutes.mjs';
import { registerApiKeyRoutes } from './routes/apiKeyRoutes.mjs';
import { registerAuthRoutes } from './routes/authRoutes.mjs';
import { registerBookRoutes } from './routes/bookRoutes.mjs';
import { registerSystemInfoRoutes } from './routes/systemInfoRoutes.mjs';
import { registerHealthRoutes } from './routes/healthRoutes.mjs';
import {
  registerRssArticleRoutes,
  registerRssDigestRoutes,
  registerRssFeedRoutes,
} from './routes/rssRoutes.mjs';
import { registerSearchIndexRoutes } from './routes/searchIndexRoutes.mjs';
import { registerSourceCredentialRoutes } from './routes/sourceCredentialRoutes.mjs';
import { registerStateRoutes } from './routes/stateRoutes.mjs';
import { registerStaticRoutes } from './routes/staticRoutes.mjs';
import { registerVideoRoutes } from './routes/videoRoutes.mjs';

export function createApp({
  mode = MODE,
  username = USERNAME,
  password = PASSWORD,
  serveFrontend = true,
  authFile = AUTH_FILE,
  aiJobRunner,
  rssFetcher = fetchRssFeed,
  rssSourceFetcher = fetchRssSource,
  rssSourceResolver = resolveRssSource,
  rssArticleFetcher = fetchRssArticle,
  sourceSecrets = sourceSecretsService,
  youtubeVideoFetcher = fetchYouTubeVideo,
  aiJobManager,
  oauth = oauthService,
  openApiTokenFile = join(DATA_DIRECTORY, 'openapi-token.json'),
} = {}) {
  const app = new Hono();
  const auth = createAuthService({
    authFile,
    defaultUsername: username,
    defaultPassword: password,
  });
  const aiJobs = aiJobManager || createAiJobManager({ runChat: aiJobRunner });

  const openApiTokens = createOpenApiTokenService(openApiTokenFile);
  registerApiMiddleware(app, { auth, mode, openApiTokens });
  registerOpenApiRoutes(app, { openApiTokens });
  registerMcpRoutes(app);
  registerAuthRoutes(app, { auth, mode });
  registerHealthRoutes(app, { mode });
  registerSystemInfoRoutes(app);
  registerStateRoutes(app, { aiJobs });
  registerApiKeyRoutes(app);
  registerAiOAuthRoutes(app, { oauth });
  registerRssFeedRoutes(app, {
    rssFetcher,
    rssSourceFetcher,
    rssSourceResolver,
  });
  registerSourceCredentialRoutes(app, { sourceSecrets });
  registerRssArticleRoutes(app, { rssArticleFetcher });
  registerRssDigestRoutes(app, { aiJobs });
  registerVideoRoutes(app, { youtubeVideoFetcher });
  registerAiRoutes(app, { aiJobs });
  registerBookRoutes(app);
  registerSearchIndexRoutes(app);

  app.all('/api/*', (c) => c.json({ error: '接口不存在' }, 404));
  if (serveFrontend) registerStaticRoutes(app);
  registerErrorHandler(app);

  return app;
}
