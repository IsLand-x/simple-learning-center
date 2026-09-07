export const READER_STATE_VERSION = 26;

function stateArray(state, key) {
  return Array.isArray(state?.[key]) ? state[key] : [];
}

function stateVersion(persistedState) {
  return Number.isInteger(persistedState?.version) ? persistedState.version : 0;
}

function highlightUpdatedAt(highlight) {
  if (Number.isFinite(highlight?.updatedAt)) return highlight.updatedAt;
  if (Number.isFinite(highlight?.commentUpdatedAt)) return highlight.commentUpdatedAt;
  return Number.isFinite(highlight?.createdAt) ? highlight.createdAt : 0;
}

function mergeLatestById(incomingItems, currentItems, idKey, updatedAtKey) {
  const merged = new Map();
  for (const item of currentItems) {
    if (typeof item?.[idKey] === 'string') merged.set(item[idKey], item);
  }
  for (const item of incomingItems) {
    const id = item?.[idKey];
    if (typeof id !== 'string') continue;
    const current = merged.get(id);
    if (!current || updatedAtKey(item) >= updatedAtKey(current)) merged.set(id, item);
  }
  return merged;
}

function tombstoneDeletedAt(tombstone) {
  return Number.isFinite(tombstone?.deletedAt) ? tombstone.deletedAt : 0;
}

/**
 * Browser persistence sends a full Zustand snapshot. Merge reader-owned state
 * by operation timestamps so an older tab or device cannot erase highlights or
 * roll back reading preferences while saving an unrelated field.
 */
export function protectReaderStateFromClient(persistedState, currentPersistedState) {
  if (!persistedState?.state || !currentPersistedState?.state) return persistedState;
  const incomingVersion = stateVersion(persistedState);
  const currentVersion = stateVersion(currentPersistedState);
  if (incomingVersion < READER_STATE_VERSION && currentVersion < READER_STATE_VERSION) {
    return persistedState;
  }

  const protectedState = structuredClone(persistedState);
  const incoming = protectedState.state;
  const current = currentPersistedState.state;
  const highlights = mergeLatestById(
    stateArray(incoming, 'highlights'),
    stateArray(current, 'highlights'),
    'id',
    highlightUpdatedAt,
  );
  const tombstones = mergeLatestById(
    stateArray(incoming, 'deletedHighlightTombstones'),
    stateArray(current, 'deletedHighlightTombstones'),
    'highlightId',
    tombstoneDeletedAt,
  );

  incoming.deletedHighlightTombstones = [...tombstones.values()];
  incoming.highlights = [...highlights.values()]
    .filter((highlight) => (
      tombstoneDeletedAt(tombstones.get(highlight.id)) < highlightUpdatedAt(highlight)
    ))
    .map((highlight) => ({
      ...highlight,
      updatedAt: highlightUpdatedAt(highlight),
    }));

  const incomingPreferencesUpdatedAt = Number.isFinite(incoming.readerPreferencesUpdatedAt)
    ? incoming.readerPreferencesUpdatedAt
    : 0;
  const currentPreferencesUpdatedAt = Number.isFinite(current.readerPreferencesUpdatedAt)
    ? current.readerPreferencesUpdatedAt
    : 0;
  if (
    current.readerPreferences
    && (!incoming.readerPreferences || currentPreferencesUpdatedAt > incomingPreferencesUpdatedAt)
  ) {
    incoming.readerPreferences = structuredClone(current.readerPreferences);
    incoming.readerPreferencesUpdatedAt = currentPreferencesUpdatedAt;
  } else {
    incoming.readerPreferencesUpdatedAt = incomingPreferencesUpdatedAt;
  }

  protectedState.version = Math.max(incomingVersion, currentVersion, READER_STATE_VERSION);
  return protectedState;
}
