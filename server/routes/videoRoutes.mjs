import { MAX_VIDEO_REQUEST_BYTES } from '../config.mjs';
import { readJsonRequest } from '../storage.mjs';
import { methodNotAllowed } from '../app/http.mjs';

export function registerVideoRoutes(app, { youtubeVideoFetcher }) {
  app.post('/api/videos/import', async (c) => {
    const payload = await readJsonRequest(c.req.raw, MAX_VIDEO_REQUEST_BYTES);
    return c.json(await youtubeVideoFetcher(payload?.url));
  });
  app.all('/api/videos/import', methodNotAllowed);
}
