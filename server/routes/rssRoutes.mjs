import { MAX_RSS_REQUEST_BYTES } from '../config.mjs';
import { readJsonRequest, readPersistedState } from '../storage.mjs';
import { methodNotAllowed } from '../app/http.mjs';

export function registerRssFeedRoutes(app, { rssFetcher, rssSourceFetcher, rssSourceResolver }) {
  app.post('/api/rss/fetch', async (c) => {
    const payload = await readJsonRequest(c.req.raw, MAX_RSS_REQUEST_BYTES);
    return c.json(await rssFetcher(payload?.url));
  });
  app.all('/api/rss/fetch', methodNotAllowed);

  app.post('/api/rss/sources/resolve', async (c) => {
    const payload = await readJsonRequest(c.req.raw, MAX_RSS_REQUEST_BYTES);
    return c.json(await rssSourceResolver(payload));
  });
  app.post('/api/rss/sources/fetch', async (c) => {
    const payload = await readJsonRequest(c.req.raw, MAX_RSS_REQUEST_BYTES);
    return c.json(await rssSourceFetcher(payload?.source));
  });
  app.all('/api/rss/sources/resolve', methodNotAllowed);
  app.all('/api/rss/sources/fetch', methodNotAllowed);
}

export function registerRssArticleRoutes(app, { rssArticleFetcher }) {
  app.post('/api/rss/article', async (c) => {
    const payload = await readJsonRequest(c.req.raw, MAX_RSS_REQUEST_BYTES);
    const persistedState = await readPersistedState();
    return c.json(
      await rssArticleFetcher(payload?.url, {
        readerConfig: persistedState?.state?.webSearchConfig,
      }),
    );
  });
  app.all('/api/rss/article', methodNotAllowed);
}

export function registerRssDigestRoutes(app, { aiJobs }) {
  app.post('/api/rss/digests/run', async (c) => {
    const payload = await readJsonRequest(c.req.raw, MAX_RSS_REQUEST_BYTES);
    const result = await aiJobs.startDigest({
      date: payload?.date,
      force: payload?.force !== false,
      trigger: 'manual',
    });
    return c.json(result, result.job ? 202 : 200);
  });
  app.all('/api/rss/digests/run', methodNotAllowed);
}
