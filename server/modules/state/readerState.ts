import type {
  HighlightItem,
  DeletedHighlightTombstone,
  ReaderPreferences,
} from '../../../contracts/domain.js';
import type { PersistedState, StoredState } from './types.js';
const READER_STATE_VERSION = 28;

const HIGHLIGHT_STATE_VERSION = 26;
const READER_STYLE_KEYS: Array<keyof ReaderPreferences> = [
  'fontSize',
  'lineHeight',
  'theme',
  'fontFamily',
  'customStyle',
];
const READER_LAYOUT_KEYS: Array<keyof ReaderPreferences> = [
  'tocWidth',
  'panelWidth',
  'tocCollapsed',
];

function stateArray<K extends 'highlights' | 'deletedHighlightTombstones'>(
  state: StoredState,
  key: K,
): NonNullable<StoredState[K]> {
  return (Array.isArray(state?.[key]) ? state[key] : []) as NonNullable<StoredState[K]>;
}

function stateVersion(persistedState: PersistedState) {
  return Number.isInteger(persistedState?.version) ? persistedState.version : 0;
}

function highlightUpdatedAt(highlight: HighlightItem | undefined) {
  if (Number.isFinite(highlight?.updatedAt)) return highlight!.updatedAt;
  if (Number.isFinite(highlight?.commentUpdatedAt)) return highlight!.commentUpdatedAt!;
  return Number.isFinite(highlight?.createdAt) ? highlight!.createdAt : 0;
}

function mergeLatestById<T, K extends keyof T>(
  incomingItems: T[],
  currentItems: T[],
  idKey: K,
  updatedAtKey: (item: T | undefined) => number,
) {
  const merged = new Map<T[K], T>();
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

function tombstoneDeletedAt(tombstone: DeletedHighlightTombstone | undefined) {
  return Number.isFinite(tombstone?.deletedAt) ? tombstone!.deletedAt : 0;
}

function preferenceGroupUpdatedAt(
  state: StoredState,
  key: 'readerStyleUpdatedAt' | 'readerLayoutUpdatedAt',
) {
  if (Number.isFinite(state?.[key])) return state[key]!;
  return Number.isFinite(state?.readerPreferencesUpdatedAt) ? state.readerPreferencesUpdatedAt! : 0;
}

function copyPreferenceGroup(
  target: Partial<ReaderPreferences>,
  source: Partial<ReaderPreferences> | undefined,
  keys: Array<keyof ReaderPreferences>,
) {
  if (!source) return;
  function copy<K extends keyof ReaderPreferences>(key: K) {
    if (source && Object.hasOwn(source, key)) target[key] = structuredClone(source[key]);
  }
  keys.forEach(copy);
}

/**
 * Browser persistence sends a full Zustand snapshot. Merge reader-owned state
 * by operation timestamps so an older tab or device cannot erase highlights or
 * roll back reading preferences while saving an unrelated field.
 */
export function protectReaderStateFromClient(
  persistedState: PersistedState,
  currentPersistedState: PersistedState | null,
) {
  if (!persistedState?.state || !currentPersistedState?.state) return persistedState;
  const incomingVersion = stateVersion(persistedState);
  const currentVersion = stateVersion(currentPersistedState);
  if (incomingVersion < HIGHLIGHT_STATE_VERSION && currentVersion < HIGHLIGHT_STATE_VERSION) {
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
    .filter(
      (highlight) =>
        tombstoneDeletedAt(tombstones.get(highlight.id)) < highlightUpdatedAt(highlight),
    )
    .map((highlight) => ({
      ...highlight,
      updatedAt: highlightUpdatedAt(highlight),
    }));

  const incomingStyleUpdatedAt = preferenceGroupUpdatedAt(incoming, 'readerStyleUpdatedAt');
  const currentStyleUpdatedAt = preferenceGroupUpdatedAt(current, 'readerStyleUpdatedAt');
  const incomingLayoutUpdatedAt = preferenceGroupUpdatedAt(incoming, 'readerLayoutUpdatedAt');
  const currentLayoutUpdatedAt = preferenceGroupUpdatedAt(current, 'readerLayoutUpdatedAt');
  const rejectLegacyPreferences =
    currentVersion >= READER_STATE_VERSION && incomingVersion < READER_STATE_VERSION;
  const useCurrentStyle =
    current.readerPreferences &&
    (!incoming.readerPreferences ||
      rejectLegacyPreferences ||
      currentStyleUpdatedAt > incomingStyleUpdatedAt);
  const useCurrentLayout =
    current.readerPreferences &&
    (!incoming.readerPreferences ||
      rejectLegacyPreferences ||
      currentLayoutUpdatedAt > incomingLayoutUpdatedAt);
  const mergedPreferences = {
    ...(current.readerPreferences ? structuredClone(current.readerPreferences) : {}),
    ...(incoming.readerPreferences ? structuredClone(incoming.readerPreferences) : {}),
  };
  if (useCurrentStyle) {
    copyPreferenceGroup(mergedPreferences, current.readerPreferences, READER_STYLE_KEYS);
  }
  if (useCurrentLayout) {
    copyPreferenceGroup(mergedPreferences, current.readerPreferences, READER_LAYOUT_KEYS);
  }
  incoming.readerPreferences = mergedPreferences;
  incoming.readerStyleUpdatedAt = useCurrentStyle ? currentStyleUpdatedAt : incomingStyleUpdatedAt;
  incoming.readerLayoutUpdatedAt = useCurrentLayout
    ? currentLayoutUpdatedAt
    : incomingLayoutUpdatedAt;
  incoming.readerPreferencesUpdatedAt = Math.max(
    incoming.readerStyleUpdatedAt,
    incoming.readerLayoutUpdatedAt,
  );

  protectedState.version = Math.max(incomingVersion, currentVersion, READER_STATE_VERSION);
  return protectedState;
}
