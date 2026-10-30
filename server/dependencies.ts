import { join } from 'node:path';
import { AUTH_FILE, DATA_DIRECTORY, MODE, PASSWORD, USERNAME } from './config.js';
import { createAiJobManager } from './modules/ai/jobs/manager.js';
import { oauthService } from './modules/ai/oauth.js';
import { createAuthService } from './modules/auth/service.js';
import { purgeExpiredTrashedBooks } from './modules/books/trash.js';
import { createOpenApiTokenService } from './modules/settings/openApiToken.js';

export interface AppOptions {
  mode?: 'local' | 'remote';
  username?: string;
  password?: string;
  serveFrontend?: boolean;
  authFile?: string;
  aiJobRunner?: NonNullable<Parameters<typeof createAiJobManager>[0]>['runChat'];
  aiJobManager?: ReturnType<typeof createAiJobManager>;
  purgeBookTrash?: typeof purgeExpiredTrashedBooks;
  oauth?: typeof oauthService;
  openApiTokenFile?: string;
}

export function createDependencies({
  mode = MODE,
  username = USERNAME,
  password = PASSWORD,
  authFile = AUTH_FILE,
  aiJobRunner,
  aiJobManager,
  purgeBookTrash = purgeExpiredTrashedBooks,
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
    purgeBookTrash,
    openApiTokens: createOpenApiTokenService(openApiTokenFile),
    oauth,
  };
}

export type AppDependencies = ReturnType<typeof createDependencies>;
