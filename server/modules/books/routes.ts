import { createBookShare, revokeBookShare } from './shares.js';
import { createRouter } from '../../http/router.js';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import {
  listBookResources,
  saveBookResource,
  removeBookResource,
  renameBookResource,
} from './resources.js';
import {
  movePersistedBookToTrash,
  permanentlyDeletePersistedBook,
  restorePersistedBookFromTrash,
} from './trash.js';
import { MAX_BOOK_BYTES } from '../../config.js';
import {
  bookPath,
  findBookCoverPath,
  exists,
  knowledgeMapDirectoryPath,
  writeRequestToFile,
} from '../../infrastructure/fs/files.js';
import { readJsonRequest } from '../../http/body.js';
import { methodNotAllowed, noContent } from '../../http/responses.js';
import { storedFileResponse } from '../../http/storedFileResponse.js';

const BOOK_ROUTE = '/:bookId';

export function createBookRoutes() {
  const app = createRouter();
  app.post(`${BOOK_ROUTE}/share`, async (c) =>
    c.json(await createBookShare(c.req.param('bookId'))),
  );
  app.delete(`${BOOK_ROUTE}/share`, async (c) => {
    await revokeBookShare(c.req.param('bookId'));
    return noContent(c);
  });
  app.all(`${BOOK_ROUTE}/share`, methodNotAllowed);
  app.get(`${BOOK_ROUTE}/resources`, async (c) =>
    c.json({ resources: await listBookResources(c.req.param('bookId')) }),
  );
  app.post(`${BOOK_ROUTE}/resources`, async (c) =>
    c.json({
      resources: await saveBookResource(
        c.req.param('bookId'),
        await readJsonRequest(c.req.raw, 4096),
      ),
    }),
  );
  app.patch(`${BOOK_ROUTE}/resources/:imageId`, async (c) =>
    c.json({
      resources: await renameBookResource(
        c.req.param('bookId'),
        c.req.param('imageId'),
        await readJsonRequest(c.req.raw, 4096),
      ),
    }),
  );
  app.delete(`${BOOK_ROUTE}/resources/:imageId`, async (c) =>
    c.json({ resources: await removeBookResource(c.req.param('bookId'), c.req.param('imageId')) }),
  );
  app.all(`${BOOK_ROUTE}/resources`, methodNotAllowed);
  app.all(`${BOOK_ROUTE}/resources/:imageId`, methodNotAllowed);
  app.on(['GET', 'HEAD'], `${BOOK_ROUTE}/knowledge-maps/:imageId`, async (c) => {
    const id = c.req.param('imageId');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id))
      return c.json({ error: '图片标识不正确' }, 400);
    const response = await storedFileResponse(
      c,
      join(knowledgeMapDirectoryPath(c.req.param('bookId')), `${id}.png`),
    );
    response.headers.set('Cache-Control', 'private, no-store');
    response.headers.set('X-Content-Type-Options', 'nosniff');
    return response;
  });
  app.on(['GET', 'HEAD'], `${BOOK_ROUTE}/cover`, async (c) => {
    const path = await findBookCoverPath(c.req.param('bookId'));
    if (!path) return c.json({ error: '书籍封面不存在' }, 404);
    const response = await storedFileResponse(c, path);
    response.headers.set('Cache-Control', 'private, max-age=604800');
    response.headers.set(
      'Content-Security-Policy',
      "sandbox; default-src 'none'; style-src 'unsafe-inline'",
    );
    response.headers.set('X-Content-Type-Options', 'nosniff');
    return response;
  });
  app.on(['GET', 'HEAD'], BOOK_ROUTE, async (c) => {
    const path = bookPath(c.req.param('bookId'));
    if (!(await exists(path))) return c.json({ error: '书籍文件不存在' }, 404);
    const fileStat = await stat(path);
    const etag = `W/"${fileStat.size}-${fileStat.mtimeMs}"`;
    // Revalidate through authentication before reusing a private browser copy.
    c.header('Cache-Control', 'private, no-cache');
    c.header('ETag', etag);
    const validators = c.req
      .header('If-None-Match')
      ?.split(',')
      .map((value) => value.trim());
    if (validators?.some((value) => value === '*' || value.replace(/^W\//, '') === etag.slice(2))) {
      return c.body(null, 304);
    }
    const response = await storedFileResponse(c, path);
    response.headers.set('Cache-Control', 'private, no-cache');
    response.headers.set('ETag', etag);
    return response;
  });
  app.put(BOOK_ROUTE, async (c) => {
    await writeRequestToFile(c.env.incoming, bookPath(c.req.param('bookId')), MAX_BOOK_BYTES);
    return noContent(c);
  });
  app.post(`${BOOK_ROUTE}/trash`, async (c) => {
    return c.json(await movePersistedBookToTrash(c.req.param('bookId')));
  });
  app.post(`${BOOK_ROUTE}/restore`, async (c) => {
    return c.json(await restorePersistedBookFromTrash(c.req.param('bookId')));
  });
  app.delete(BOOK_ROUTE, async (c) => {
    return c.json(await permanentlyDeletePersistedBook(c.req.param('bookId')));
  });
  app.all(`${BOOK_ROUTE}/trash`, methodNotAllowed);
  app.all(`${BOOK_ROUTE}/restore`, methodNotAllowed);
  app.all(`${BOOK_ROUTE}/cover`, methodNotAllowed);
  app.all(BOOK_ROUTE, methodNotAllowed);
  return app;
}
