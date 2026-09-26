import { join } from 'node:path';
import { AUTH_FILE, DATA_DIRECTORY, MODE, PASSWORD, USERNAME } from './config.js';
import { createAiJobManager } from './modules/ai/jobs/manager.js';
import { oauthService } from './modules/ai/oauth.js';
import { createAuthService } from './modules/auth/service.js';
import { createOpenApiTokenService } from './modules/settings/openApiToken.js';
import { sourceSecretsService } from './modules/settings/sourceSecrets.js';
import { fetchRssArticle } from './modules/rss/article.js';
import { fetchRssFeed } from './modules/rss/feed.js';
import { fetchRssSource, resolveRssSource } from './modules/rss/sources.js';
import { fetchYouTubeVideo } from './modules/videos/youtube.js';

export interface AppOptions {
  mode?: 'local' | 'remote';
  username?: string;
  password?: string;
  serveFrontend?: boolean;
  authFile?: string;
  aiJobRunner?: NonNullable<Parameters<typeof createAiJobManager>[0]>['runChat'];
  rssFetcher?: typeof fetchRssFeed;
  rssSourceFetcher?: typeof fetchRssSource;
  rssSourceResolver?: typeof resolveRssSource;
  rssArticleFetcher?: typeof fetchRssArticle;
  sourceSecrets?: typeof sourceSecretsService;
  youtubeVideoFetcher?: typeof fetchYouTubeVideo;
  aiJobManager?: ReturnType<typeof createAiJobManager>;
  oauth?: typeof oauthService;
  openApiTokenFile?: string;
}

export function createDependencies({
  mode = MODE,
  username = USERNAME,
  password = PASSWORD,
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
}: AppOptions) {
  return {
    mode,
    auth: createAuthService({
      authFile,
      defaultUsername: username,
      defaultPassword: password,
    }),
    aiJobs: aiJobManager || createAiJobManager({ runChat: aiJobRunner }),
    openApiTokens: createOpenApiTokenService(openApiTokenFile),
    rssFetcher,
    rssSourceFetcher,
    rssSourceResolver,
    rssArticleFetcher,
    sourceSecrets,
    youtubeVideoFetcher,
    oauth,
  };
}

export type AppDependencies = ReturnType<typeof createDependencies>;
