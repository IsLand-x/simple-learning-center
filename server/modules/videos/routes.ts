import type { AppDependencies } from '../../dependencies.js';
import { createRouter } from '../../http/router.js';
import { MAX_VIDEO_REQUEST_BYTES } from '../../config.js';
import { readJsonRequest } from '../../http/body.js';
import { methodNotAllowed } from '../../http/responses.js';

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
