import { demoBooks } from '../data/demo';
import { DEFAULT_READER_AI_ASSISTANT_PROMPT } from '../lib/readerAiPrompts';
import { DEFAULT_READER_CUSTOM_STYLE } from '../lib/readerThemes';
import type {
  AiPreferences,
  ReaderPreferences,
  RssDigestSettings,
  WebSearchConfig,
} from '../types';
import type { LearningState } from './learningState';

export const defaultReaderPreferences: ReaderPreferences = {
  fontSize: 18,
  lineHeight: 2,
  theme: 'paper',
  fontFamily: 'kai',
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

export const LEGACY_RSS_DIGEST_PROMPT =
  '请把当天尚未读过的 RSS 内容整理成一份中文日报。先按事件和主题去重，再按重要性组织；每条结论说明发生了什么、为什么值得关注，并用 Markdown 链接附上对应订阅源原文。不要重复陈述同一事件，不要编造来源或正文中没有的信息。';

export const DEFAULT_RSS_DIGEST_PROMPT =
  '请把当天全部 RSS 内容整理成一份中文日报。先按事件和主题去重，再按重要性组织；每条结论说明发生了什么、为什么值得关注，并用 Markdown 链接附上对应订阅源原文。不要重复陈述同一事件，不要编造来源或正文中没有的信息。';

export const defaultRssDigestSettings: RssDigestSettings = {
  enabled: false,
  provider: null,
  model: '',
  prompt: DEFAULT_RSS_DIGEST_PROMPT,
  scheduleMode: 'every-4-hours',
  times: ['08:00', '12:00', '18:00', '22:00'],
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
  highlights: [],
  notes: [],
  chats: [],
  chatSessions: [],
  readingSessions: [],
  rssFolders: [],
  rssFeeds: [],
  rssItems: [],
  rssAnnotations: [],
  rssDailyDigests: [],
  rssDigestRuns: [],
  rssDigestSettings: defaultRssDigestSettings,
  rssPanelWidth: 380,
  videoResources: [],
  videoTimestampNotes: [],
  videoPanelWidth: 400,
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
