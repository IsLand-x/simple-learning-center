import type { AppDependencies } from '../app/dependencies.js';
import { createRouter } from '../app/router.js';
import { MAX_VIDEO_REQUEST_BYTES } from '../config.js';
import { readJsonRequest } from '../app/body.js';
import { methodNotAllowed } from '../app/http.js';

export function createVideoRoutes({
  youtubeVideoFetcher,
}: Pick<AppDependencies, 'youtubeVideoFetcher'>) {
  const app = createRouter();
  app.post('/import', async (c) => {
    const payload = await readJsonRequest(c.req.raw, MAX_VIDEO_REQUEST_BYTES);
    return c.json(await youtubeVideoFetcher(payload?.url));
  });
  app.all('/import', methodNotAllowed);
  return app;
}
