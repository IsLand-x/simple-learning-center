import { useLearningStore } from './useLearningStore';
import { refreshServerState } from './serverStateStorage';

export async function synchronizeLearningState() {
  await refreshServerState();
  await useLearningStore.persist.rehydrate();
}
