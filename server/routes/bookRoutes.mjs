import {
  movePersistedBookToTrash,
  permanentlyDeletePersistedBook,
  restorePersistedBookFromTrash,
} from '../bookTrash.mjs';
import { MAX_BOOK_BYTES } from '../config.mjs';
import { bookPath, exists, findBookCoverPath, writeRequestToFile } from '../storage.mjs';
import { methodNotAllowed, noContent } from '../app/http.mjs';
import { storedFileResponse } from './storedFileResponse.mjs';

const BOOK_ROUTE = '/api/books/:bookId';

export function registerBookRoutes(app) {
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
    return storedFileResponse(c, path);
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
}
