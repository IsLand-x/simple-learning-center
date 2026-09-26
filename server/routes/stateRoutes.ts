import { protectClientState } from '../modules/state/sync.js';
import type { PersistedState } from '../modules/state/types.js';
import type { AppDependencies } from '../app/dependencies.js';
import { createRouter } from '../app/router.js';
import { purgeExpiredTrashedBooks } from '../modules/library/trash.js';
import { MAX_STATE_BYTES } from '../config.js';
import {
  isStateDomain,
  mergeStateDomainSnapshot,
  serializeStateDomainSnapshot,
} from '../modules/state/domains.js';
import { readJsonRequest } from '../app/body.js';
import {
  readPersistedState,
  stateFileEtag,
  writePersistedState,
} from '../modules/state/repository.js';
import { methodNotAllowed, noContent } from '../app/http.js';

export function createStateRoutes({ aiJobs }: Pick<AppDependencies, 'aiJobs'>) {
  const app = createRouter();
  app.get('/', async (c) => {
    await purgeExpiredTrashedBooks();
    const etag = await stateFileEtag();
    if (etag) c.header('ETag', etag);
    if (etag && c.req.header('If-None-Match') === etag) return c.body(null, 304);
    const state = await readPersistedState();
    return state ? c.json(state) : noContent(c);
  });
  app.put('/', async (c) => {
    const state = await readJsonRequest<PersistedState>(c.req.raw, MAX_STATE_BYTES);
    const initializeOnly = c.req.query('initialize') === '1';
    await writePersistedState(
      state,
      initializeOnly,
      initializeOnly
        ? undefined
        : (incomingState: PersistedState, currentState: PersistedState | null) =>
            protectClientState(aiJobs.protectPersistedState, incomingState, currentState),
    );
    return noContent(c);
  });
  app.all('/', methodNotAllowed);

  app.get('/:domain', async (c) => {
    const domain = c.req.param('domain');
    if (!isStateDomain(domain)) return c.json({ error: '状态分区不存在' }, 404);
    if (domain === 'library') await purgeExpiredTrashedBooks();
    const state = await readPersistedState({ hydrateNote: () => domain === 'reading' });
    const serialized = serializeStateDomainSnapshot(state, domain);
    if (!serialized) return noContent(c);
    c.header('ETag', serialized.etag);
    if (c.req.header('If-None-Match') === serialized.etag) return c.body(null, 304);
    return c.body(serialized.body, 200, { 'Content-Type': 'application/json; charset=utf-8' });
  });
  app.put('/:domain', async (c) => {
    const domain = c.req.param('domain');
    if (!isStateDomain(domain)) return c.json({ error: '状态分区不存在' }, 404);
    const snapshot = await readJsonRequest<PersistedState>(c.req.raw, MAX_STATE_BYTES);
    await writePersistedState(
      snapshot,
      false,
      async (incomingSnapshot: PersistedState, currentState: PersistedState | null) => {
        const mergedState = mergeStateDomainSnapshot(currentState, incomingSnapshot, domain);
        return protectClientState(aiJobs.protectPersistedState, mergedState, currentState);
      },
    );
    return noContent(c);
  });
  app.all('/:domain', methodNotAllowed);
  return app;
}
