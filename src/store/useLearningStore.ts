import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { serverStateStorage } from '../lib/serverStateStorage';
import { LEARNING_STORE_VERSION } from '../lib/stateDomains';
import { createConversationActions } from './actions/conversationActions';
import { createLibraryActions } from './actions/libraryActions';
import { createPreferenceActions } from './actions/preferenceActions';
import { createReadingActions } from './actions/readingActions';
import { createRssActions } from './actions/rssActions';
import { createVideoActions } from './actions/videoActions';
import { initialLearningState } from './defaults';
import type { LearningState } from './learningState';
import { mergeLearningState } from './persistence/mergeLearningState';
import { migrateLearningState } from './persistence/migrateLearningState';

export const useLearningStore = create<LearningState>()(
  persist(
    (set) => ({
      ...initialLearningState,
      ...createLibraryActions(set),
      ...createReadingActions(set),
      ...createConversationActions(set),
      ...createRssActions(set),
      ...createVideoActions(set),
      ...createPreferenceActions(set),
    }),
    {
      name: 'learning-center-state-v1',
      version: LEARNING_STORE_VERSION,
      storage: createJSONStorage(() => serverStateStorage),
      skipHydration: true,
      migrate: migrateLearningState,
      merge: mergeLearningState,
    },
  ),
);
