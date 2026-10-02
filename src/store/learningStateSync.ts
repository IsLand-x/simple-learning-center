import type { StateDomain } from '../api/state/type';
import { useLearningStore } from './useLearningStore';
import { refreshServerState } from './serverStateStorage';

export async function synchronizeLearningState(domains?: readonly StateDomain[]) {
  await refreshServerState(domains);
  await useLearningStore.persist.rehydrate();
}
