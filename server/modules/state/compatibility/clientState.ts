import { protectReaderStateFromClient } from './readerState.js';
import { protectServerRssState } from './rssState.js';
import type { PersistedState } from '../types.js';
import { protectConversations } from './conversations.js';

export async function protectClientState(
  protectAiState: (state: PersistedState) => PersistedState | Promise<PersistedState>,
  incomingState: PersistedState,
  currentState: PersistedState | null,
) {
  const protectedState = protectReaderStateFromClient(
    protectServerRssState(await protectAiState(incomingState), currentState),
    currentState,
  );
  // Read-only generated maps are server-owned. Stale and older clients cannot erase them.
  if (currentState) {
    protectedState.state.chapterMindMaps = structuredClone(
      currentState.state.chapterMindMaps ?? [],
    );
    protectedState.state.chapterVideos = structuredClone(currentState.state.chapterVideos ?? []);
  }
  return protectConversations(protectedState, currentState);
}
