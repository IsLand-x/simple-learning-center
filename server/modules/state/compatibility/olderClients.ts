import type { PersistedState } from '../types.js';

const BOOK_LIST_STATE_VERSION = 24;

export function protectBookListStateFromOlderClient(
  persistedState: PersistedState,
  currentPersistedState: PersistedState | null,
) {
  const incomingVersion = Number.isInteger(persistedState?.version) ? persistedState.version : 0;
  const currentVersion = Number.isInteger(currentPersistedState?.version)
    ? (currentPersistedState?.version ?? 0)
    : 0;
  if (
    currentVersion < BOOK_LIST_STATE_VERSION ||
    incomingVersion >= BOOK_LIST_STATE_VERSION ||
    !persistedState?.state ||
    !currentPersistedState?.state
  ) {
    return persistedState;
  }
  const protectedState = structuredClone(persistedState);
  protectedState.version = currentVersion;
  if (currentPersistedState.state.bookLists) {
    protectedState.state.bookLists = structuredClone(
      Array.isArray(currentPersistedState.state.bookLists)
        ? currentPersistedState.state.bookLists
        : [],
    );
  }
  return protectedState;
}
