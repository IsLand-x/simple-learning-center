import { protectReaderStateFromClient } from './readerState.js';
import { protectServerRssState } from '../rss/stateProtection.js';
import type { PersistedState } from './types.js';

export async function protectClientState(
  protectAiState: (state: PersistedState) => PersistedState | Promise<PersistedState>,
  incomingState: PersistedState,
  currentState: PersistedState | null,
) {
  return protectReaderStateFromClient(
    protectServerRssState(await protectAiState(incomingState), currentState),
    currentState,
  );
}
