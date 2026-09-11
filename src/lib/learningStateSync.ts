import { useLearningStore } from '../store/useLearningStore';
import { captureServerStateBaseline, refreshServerState } from './serverStateStorage';

export async function synchronizeLearningState() {
  await refreshServerState();
  await useLearningStore.persist.rehydrate();
  captureServerStateBaseline(useLearningStore.getState() as unknown as Record<string, unknown>);
}
