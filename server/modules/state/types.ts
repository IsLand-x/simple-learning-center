import type { LearningData } from '../../../contracts/state.js';

// Older clients can omit domains. Unknown fields survive snapshots and disk writes.
export interface StoredState extends Partial<
  Omit<LearningData, 'books' | 'aiPreferences' | 'readerPreferences'>
> {
  books?: Array<LearningData['books'][number] & { deletedAt?: number }>;
  aiPreferences?: Partial<LearningData['aiPreferences']>;
  readerPreferences?: Partial<LearningData['readerPreferences']>;
  [field: string]: unknown;
}

export interface PersistedState {
  state: StoredState;
  version: number;
  // Server-owned deletion records are never accepted from client snapshots.
  deletedConversationIds?: string[];
  [field: string]: unknown;
}
