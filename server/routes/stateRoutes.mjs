import { purgeExpiredTrashedBooks } from '../bookTrash.mjs';
import { MAX_STATE_BYTES } from '../config.mjs';
import { protectReaderStateFromClient } from '../readerState.mjs';
import { protectServerRssState } from '../rssScheduler.mjs';
import {
  isStateDomain,
  mergeStateDomainSnapshot,
  serializeStateDomainSnapshot,
} from '../stateDomains.mjs';
import {
  readJsonRequest,
  readPersistedState,
  stateFileEtag,
  writePersistedState,
} from '../storage.mjs';
import { methodNotAllowed, noContent } from '../app/http.mjs';

async function protectClientState(aiJobs, incomingState, currentState) {
  return protectReaderStateFromClient(
    protectServerRssState(await aiJobs.protectPersistedState(incomingState), currentState),
    currentState,
  );
}

export function registerStateRoutes(app, { aiJobs }) {
  app.get('/api/state', async (c) => {
    await purgeExpiredTrashedBooks();
    const etag = await stateFileEtag();
    if (etag) c.header('ETag', etag);
    if (etag && c.req.header('If-None-Match') === etag) return c.body(null, 304);
    const state = await readPersistedState();
    return state ? c.json(state) : noContent(c);
  });
  app.put('/api/state', async (c) => {
    const state = await readJsonRequest(c.req.raw, MAX_STATE_BYTES);
    const initializeOnly = c.req.query('initialize') === '1';
    await writePersistedState(
      state,
      initializeOnly,
      initializeOnly
        ? undefined
        : (incomingState, currentState) => protectClientState(aiJobs, incomingState, currentState),
    );
    return noContent(c);
  });
  app.all('/api/state', methodNotAllowed);

  app.get('/api/state/:domain', async (c) => {
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
  app.put('/api/state/:domain', async (c) => {
    const domain = c.req.param('domain');
    if (!isStateDomain(domain)) return c.json({ error: '状态分区不存在' }, 404);
    const snapshot = await readJsonRequest(c.req.raw, MAX_STATE_BYTES);
    await writePersistedState(snapshot, false, async (incomingSnapshot, currentState) => {
      const mergedState = mergeStateDomainSnapshot(currentState, incomingSnapshot, domain);
      return protectClientState(aiJobs, mergedState, currentState);
    });
    return noContent(c);
  });
  app.all('/api/state/:domain', methodNotAllowed);
}
