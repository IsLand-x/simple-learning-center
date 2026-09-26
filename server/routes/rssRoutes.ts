import type { AppDependencies } from '../app/dependencies.js';
import { createRouter } from '../app/router.js';
import { MAX_RSS_REQUEST_BYTES } from '../config.js';
import { readJsonRequest } from '../app/body.js';
import { readPersistedState } from '../modules/state/repository.js';
import { methodNotAllowed } from '../app/http.js';

export function createRssFeedRoutes({
  rssFetcher,
  rssSourceFetcher,
  rssSourceResolver,
}: Pick<AppDependencies, 'rssFetcher' | 'rssSourceFetcher' | 'rssSourceResolver'>) {
  const app = createRouter();
  app.post('/fetch', async (c) => {
    const payload = await readJsonRequest(c.req.raw, MAX_RSS_REQUEST_BYTES);
    return c.json(await rssFetcher(payload?.url));
  });
  app.all('/fetch', methodNotAllowed);

  app.post('/sources/resolve', async (c) => {
    const payload = await readJsonRequest(c.req.raw, MAX_RSS_REQUEST_BYTES);
    return c.json(await rssSourceResolver(payload));
  });
  app.post('/sources/fetch', async (c) => {
    const payload = await readJsonRequest(c.req.raw, MAX_RSS_REQUEST_BYTES);
    return c.json(await rssSourceFetcher(payload?.source));
  });
  app.all('/sources/resolve', methodNotAllowed);
  app.all('/sources/fetch', methodNotAllowed);
  return app;
}

export function createRssArticleRoutes({
  rssArticleFetcher,
}: Pick<AppDependencies, 'rssArticleFetcher'>) {
  const app = createRouter();
  app.post('/article', async (c) => {
    const payload = await readJsonRequest(c.req.raw, MAX_RSS_REQUEST_BYTES);
    const persistedState = await readPersistedState();
    return c.json(
      await rssArticleFetcher(payload?.url, {
        readerConfig: persistedState?.state?.webSearchConfig,
      }),
    );
  });
  app.all('/article', methodNotAllowed);
  return app;
}

export function createRssDigestRoutes({ aiJobs }: Pick<AppDependencies, 'aiJobs'>) {
  const app = createRouter();
  app.post('/digests/run', async (c) => {
    const payload = await readJsonRequest(c.req.raw, MAX_RSS_REQUEST_BYTES);
    const result = await aiJobs.startDigest({
      date: payload?.date,
      force: payload?.force !== false,
      trigger: 'manual',
    });
    return c.json(result, result.job ? 202 : 200);
  });
  app.all('/digests/run', methodNotAllowed);
  return app;
}
