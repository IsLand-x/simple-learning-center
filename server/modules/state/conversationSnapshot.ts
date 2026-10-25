import { readStateProjection } from './stateStore.js';
import { serializeStateDomainSnapshot } from './domains.js';
import type { StoredState } from './types.js';

type Serialized = Pick<
  NonNullable<ReturnType<typeof serializeStateDomainSnapshot>>,
  'body' | 'etag'
> | null;
const snapshots = new WeakMap<StoredState, { version: number; serialized: Serialized }>();

export function readSerializedConversations() {
  return readStateProjection(
    (state, version) => {
      const cached = snapshots.get(state);
      if (cached?.version === version) return cached.serialized;
      const snapshot =
        !version && !Object.keys(state).length
          ? null
          : serializeStateDomainSnapshot({ state, version }, 'conversations');
      const serialized = snapshot ? { body: snapshot.body, etag: snapshot.etag } : null;
      snapshots.set(state, { version, serialized });
      return serialized;
    },
    { waitForWrites: false },
  );
}
