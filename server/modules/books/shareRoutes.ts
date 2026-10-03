import { doubanBooks } from './douban.js';
import { createRouter } from '../../http/router.js';
import { methodNotAllowed } from '../../http/responses.js';
import { storedFileResponse } from '../../http/storedFileResponse.js';
import { bookPath, findBookCoverPath } from '../../infrastructure/fs/files.js';
import { resolveBookShare } from './shares.js';

export function createPublicBookShareRoutes() {
  const app = createRouter();
  app.use('*', async (c, next) => {
    c.header('Cache-Control', 'private, no-store');
    c.header('Referrer-Policy', 'no-referrer');
    c.header('X-Content-Type-Options', 'nosniff');
    await next();
  });
  app.get('/:token/douban', async (c) => {
    const book = await resolveBookShare(c.req.param('token'));
    return c.json(await doubanBooks.lookup(book.title, book.author));
  });
  app.all('/:token/douban', methodNotAllowed);
  app.get('/:token', async (c) => {
    const book = await resolveBookShare(c.req.param('token'));
    return c.json({ title: book.title, author: book.author });
  });
  app.on(['GET', 'HEAD'], '/:token/epub', async (c) => {
    const book = await resolveBookShare(c.req.param('token'));
    const response = await storedFileResponse(c, bookPath(book.id));
    response.headers.set('Content-Type', 'application/epub+zip');
    response.headers.set('Cache-Control', 'private, no-store');
    response.headers.set(
      'Content-Disposition',
      `attachment; filename="book.epub"; filename*=UTF-8''${encodeURIComponent(book.title + '.epub')}`,
    );
    return response;
  });
  app.on(['GET', 'HEAD'], '/:token/cover', async (c) => {
    const book = await resolveBookShare(c.req.param('token'));
    const path = await findBookCoverPath(book.id);
    if (!path) return c.json({ error: '封面不存在' }, 404);
    const response = await storedFileResponse(c, path);
    response.headers.set('Cache-Control', 'private, no-store');
    response.headers.set(
      'Content-Security-Policy',
      "sandbox; default-src 'none'; style-src 'unsafe-inline'",
    );
    return response;
  });
  app.all('/:token', methodNotAllowed);
  app.all('/:token/epub', methodNotAllowed);
  app.all('/:token/cover', methodNotAllowed);
  return app;
}
