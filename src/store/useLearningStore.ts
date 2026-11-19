import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { serverStateStorage, migrateServerConversations } from './serverStateStorage';
import { LEARNING_STORE_VERSION } from './stateDomains';
import { createConversationActions } from './actions/conversationActions';
import { createLibraryActions } from './actions/libraryActions';
import { createPreferenceActions } from './actions/preferenceActions';
import { createReadingActions } from './actions/readingActions';
import { initialLearningState } from './defaults';
import type { LearningState } from './learningState';
import { mergeLearningState } from './persistence/mergeLearningState';

export const useLearningStore = create<LearningState>()(
  persist(
    (set, get) => ({
      ...initialLearningState,
      ...createLibraryActions(set),
      ...createReadingActions(set),
      ...createConversationActions(set, get),
      ...createPreferenceActions(set),
    }),
    {
      name: 'learning-center-state-v1',
      version: LEARNING_STORE_VERSION,
      storage: createJSONStorage(() => serverStateStorage),
      skipHydration: true,
      partialize: ({
        chats: _chats,
        chatSessions: _sessions,
        conversationSummaries: _summaries,
        ...state
      }) => state,
      migrate: async (state, version) => {
        // 44 起删除阅读笔记分区，剥离旧快照里的 notes / deletedNoteTombstones。
        const envelope = (state ?? {}) as Partial<LearningState> & {
          notes?: unknown;
          deletedNoteTombstones?: unknown;
        };
        await migrateServerConversations(envelope, version);
        const {
          chats: _chats,
          chatSessions: _sessions,
          notes: _notes,
          deletedNoteTombstones: _noteTombstones,
          ...rest
        } = envelope;
        return rest;
      },
      merge: mergeLearningState,
    },
  ),
);
