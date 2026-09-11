import { rm } from 'node:fs/promises';
import { MAX_INDEX_BYTES } from '../config.mjs';
import { atomicWrite, exists, readJsonRequest, searchIndexPath } from '../storage.mjs';
import { methodNotAllowed, noContent } from '../app/http.mjs';
import { storedFileResponse } from './storedFileResponse.mjs';

const SEARCH_INDEX_ROUTE = '/api/search-indexes/:bookId';

export function registerSearchIndexRoutes(app) {
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
}
