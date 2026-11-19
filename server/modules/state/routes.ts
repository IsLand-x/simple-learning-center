import { compress } from 'hono/compress';
import { protectClientState } from './compatibility/clientState.js';
import type { PersistedState } from './types.js';
import type { AppDependencies } from '../../dependencies.js';
import { createRouter } from '../../http/router.js';
import { MAX_STATE_BYTES } from '../../config.js';
import {
  isStateDomain,
  mergeStateDomainSnapshot,
  serializeStateDomainSnapshot,
  stateDomainFields,
} from './domains.js';
import { readJsonRequest } from '../../http/body.js';
import { readPersistedState, stateFileEtag, writePersistedState } from './stateStore.js';
import { methodNotAllowed, noContent } from '../../http/responses.js';
import { readSerializedConversations } from './conversationSnapshot.js';
import { mergeMigratedConversations } from './compatibility/conversations.js';

export function createStateRoutes({
  aiJobs,
  purgeBookTrash,
}: Pick<AppDependencies, 'aiJobs' | 'purgeBookTrash'>) {
  const app = createRouter();
  app.use('*', compress({ encoding: 'gzip', contentTypeFilter: /^application\/json/ }));
  app.get('/', async (c) => {
    await purgeBookTrash();
    const etag = await stateFileEtag();
    if (etag) c.header('ETag', etag);
    if (
      etag &&
      c.req
        .header('If-None-Match')
        ?.split(',')
        .some(
          (value) =>
            value.trim().replace(/^W\//, '') === etag.replace(/^W\//, '') || value.trim() === '*',
        )
    )
      return c.body(null, 304);
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
    if (domain === 'library') await purgeBookTrash();
    const state =
      domain === 'conversations'
        ? null
        : await readPersistedState({
            fields: stateDomainFields(domain),
            // Metadata partitions read the last atomic commit instead of waiting
            // behind a slow writer.
            waitForWrites: false,
          });
    const serialized =
      domain === 'conversations'
        ? await readSerializedConversations()
        : serializeStateDomainSnapshot(state, domain);
    if (!serialized) return noContent(c);
    c.header('ETag', serialized.etag);
    if (
      c.req
        .header('If-None-Match')
        ?.split(',')
        .some(
          (value) => value.trim().replace(/^W\//, '') === serialized.etag || value.trim() === '*',
        )
    )
      return c.body(null, 304);
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
        if (domain === 'conversations' && c.req.query('migrate') === '1')
          mergeMigratedConversations(mergedState, currentState);
        return protectClientState(aiJobs.protectPersistedState, mergedState, currentState);
      },
      {
        fields: stateDomainFields(domain),
        readFields: [...stateDomainFields(domain), ...stateDomainFields('library')],
      },
    );
    return noContent(c);
  });
  app.all('/:domain', methodNotAllowed);
  return app;
}
