import { createRouter } from '../../http/router.js';
import { rm } from 'node:fs/promises';
import { MAX_INDEX_BYTES } from '../../config.js';
import { atomicWrite, exists, searchIndexPath } from '../../infrastructure/fs/files.js';
import { readJsonRequest } from '../../http/body.js';
import { methodNotAllowed, noContent } from '../../http/responses.js';
import { storedFileResponse } from '../../http/storedFileResponse.js';

const SEARCH_INDEX_ROUTE = '/:bookId';

export function createSearchIndexRoutes() {
  const app = createRouter();
  app.get(SEARCH_INDEX_ROUTE, async (c) => {
    const path = searchIndexPath(c.req.param('bookId'));
    if (!(await exists(path))) return c.json({ error: '书内索引不存在' }, 404);
    return storedFileResponse(c, path);
  });
  app.put(SEARCH_INDEX_ROUTE, async (c) => {
    const index = await readJsonRequest(c.req.raw, MAX_INDEX_BYTES);
    await atomicWrite(searchIndexPath(c.req.param('bookId')), `${JSON.stringify(index)}\n`);
    return noContent(c);
  });
  app.delete(SEARCH_INDEX_ROUTE, async (c) => {
    await rm(searchIndexPath(c.req.param('bookId')), { force: true });
    return noContent(c);
  });
  app.all(SEARCH_INDEX_ROUTE, methodNotAllowed);
  return app;
}
