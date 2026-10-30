import type { StateDomain } from '../../contracts/state';
import { useLearningStore } from './useLearningStore';
import { refreshServerState } from './serverStateStorage';
import { refreshActiveConversations } from './conversationSync';

export async function synchronizeLearningState(domains?: readonly StateDomain[]) {
  await refreshServerState(domains);
  await useLearningStore.persist.rehydrate();
  if (!domains) await refreshActiveConversations();
}
