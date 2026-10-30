import { demoBooks } from '../util/fixtures/demo';
import { DEFAULT_READER_AI_ASSISTANT_PROMPT } from '../util/ai/readerAiPrompts';
import {
  DEFAULT_READER_CUSTOM_STYLE,
  READER_TYPOGRAPHY_PRESETS,
} from '../util/reading/readerThemes';
import type { AiPreferences } from '../../contracts/ai';
import type { ReaderPreferences } from '../../contracts/reading';
import type { WebSearchConfig } from '../../contracts/settings';
import type { LearningState } from './learningState';

export const defaultReaderPreferences: ReaderPreferences = {
  ...READER_TYPOGRAPHY_PRESETS[0].preferences,
  theme: 'paper',
  customStyle: DEFAULT_READER_CUSTOM_STYLE,
  tocWidth: 272,
  panelWidth: 380,
  tocCollapsed: false,
};

export const defaultAiPreferences: AiPreferences = {
  provider: null,
  model: '',
  reasoningEffort: 'auto',
  assistantPrompt: DEFAULT_READER_AI_ASSISTANT_PROMPT,
  autoHideReasoning: false,
  hiddenPromptTemplateIds: [],
};

export const defaultWebSearchConfig: WebSearchConfig = {
  provider: 'jina',
  apiKey: '',
};

type LearningStateData = Omit<LearningState, keyof LearningStateActions>;

type LearningStateActions = {
  [
    Key in keyof LearningState as LearningState[Key] extends (...args: never[]) => unknown
      ? Key
      : never
  ]: LearningState[Key];
};

export const initialLearningState: LearningStateData = {
  books: demoBooks,
  bookLists: [],
  trashedBooks: [],
  deletedBookTombstones: [],
  deletedHighlightTombstones: [],
  conversationDrafts: [],
  highlights: [],
  notes: [],
  deletedNoteTombstones: [],
  chats: [],
  chatSessions: [],
  conversationSummaries: [],
  readingSessions: [],
  chapterMindMaps: [],
  chapterVideos: [],
  openAIConfigs: [],
  webSearchConfig: defaultWebSearchConfig,
  aiPreferences: defaultAiPreferences,
  navCollapsed: false,
  themeMode: 'light',
  readerPreferences: defaultReaderPreferences,
  readerPreferencesUpdatedAt: 0,
  readerStyleUpdatedAt: 0,
  readerLayoutUpdatedAt: 0,
};
