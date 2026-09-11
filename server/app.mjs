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
} = {}) {
  const app = new Hono();
  const auth = createAuthService({
    authFile,
    defaultUsername: username,
    defaultPassword: password,
  });
  const aiJobs = aiJobManager || createAiJobManager({ runChat: aiJobRunner });

  registerApiMiddleware(app, { auth, mode });
  registerAuthRoutes(app, { auth, mode });
  registerHealthRoutes(app, { mode });
  registerStateRoutes(app, { aiJobs });
  registerApiKeyRoutes(app);
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
