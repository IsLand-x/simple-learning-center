import { createRouter } from '../../http/router.js';
import { methodNotAllowed, noContent } from '../../http/responses.js';
import { storedFileResponse } from '../../http/storedFileResponse.js';
import { chapterVideoPath } from '../../infrastructure/fs/files.js';
import { chapterVideoResponse, deleteChapterVideo, requireChapterVideo } from './chapterVideos.js';

export function createChapterVideoRoutes() {
  const app = createRouter();
  const route = '/:bookId/chapter-videos/:videoId';
  app.on(['GET', 'HEAD'], route, (c) =>
    chapterVideoResponse(c.req.raw, c.req.param('bookId'), c.req.param('videoId')),
  );
  app.on(['GET', 'HEAD'], `${route}/poster`, async (c) => {
    await requireChapterVideo(c.req.param('bookId'), c.req.param('videoId'));
    return storedFileResponse(
      c,
      chapterVideoPath(c.req.param('bookId'), c.req.param('videoId'), 'png'),
      'private, no-store',
    );
  });
  app.delete(route, async (c) => {
    await deleteChapterVideo(c.req.param('bookId'), c.req.param('videoId'));
    return noContent(c);
  });
  app.all(route, methodNotAllowed);
  app.all(`${route}/poster`, methodNotAllowed);
  return app;
}
