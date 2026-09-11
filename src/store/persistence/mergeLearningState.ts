import {
  defaultAiPreferences,
  defaultReaderPreferences,
  defaultRssDigestSettings,
  defaultWebSearchConfig,
} from '../defaults';
import type { LearningState } from '../learningState';
import {
  normalizeReaderFont,
  normalizeReaderTheme,
  normalizeRssFeedSource,
  normalizeStoredCustomStyle,
} from '../normalizers';
import { mergeReaderHighlights, mergeReaderPreferences } from './readerStateMerge';

export function mergeLearningState(
  persistedState: unknown,
  currentState: LearningState,
): LearningState {
  const persisted = persistedState as Partial<LearningState>;
  const mergedHighlights = mergeReaderHighlights(persisted, currentState);
  const mergedPreferences = mergeReaderPreferences(persisted, currentState);
  return {
    ...currentState,
    ...persisted,
    bookLists: Array.isArray(persisted.bookLists) ? persisted.bookLists : currentState.bookLists,
    trashedBooks: Array.isArray(persisted.trashedBooks)
      ? persisted.trashedBooks
      : currentState.trashedBooks,
    deletedBookTombstones: Array.isArray(persisted.deletedBookTombstones)
      ? persisted.deletedBookTombstones
      : currentState.deletedBookTombstones,
    deletedHighlightTombstones: mergedHighlights.deletedHighlightTombstones,
    highlights: mergedHighlights.highlights,
    rssFolders: Array.isArray(persisted.rssFolders)
      ? persisted.rssFolders
      : currentState.rssFolders,
    rssFeeds: Array.isArray(persisted.rssFeeds)
      ? persisted.rssFeeds.map((feed) => normalizeRssFeedSource(feed))
      : currentState.rssFeeds,
    rssItems: Array.isArray(persisted.rssItems) ? persisted.rssItems : currentState.rssItems,
    rssAnnotations: Array.isArray(persisted.rssAnnotations)
      ? persisted.rssAnnotations
      : currentState.rssAnnotations,
    rssDailyDigests: Array.isArray(persisted.rssDailyDigests)
      ? persisted.rssDailyDigests
      : currentState.rssDailyDigests,
    rssDigestRuns: Array.isArray(persisted.rssDigestRuns)
      ? persisted.rssDigestRuns
      : currentState.rssDigestRuns,
    rssDigestSettings: {
      ...defaultRssDigestSettings,
      ...currentState.rssDigestSettings,
      ...(persisted.rssDigestSettings ?? {}),
      times: Array.isArray(persisted.rssDigestSettings?.times)
        ? persisted.rssDigestSettings.times
        : currentState.rssDigestSettings.times,
    },
    rssPanelWidth:
      typeof persisted.rssPanelWidth === 'number'
        ? persisted.rssPanelWidth
        : currentState.rssPanelWidth,
    videoResources: Array.isArray(persisted.videoResources)
      ? persisted.videoResources
      : currentState.videoResources,
    videoTimestampNotes: Array.isArray(persisted.videoTimestampNotes)
      ? persisted.videoTimestampNotes
      : currentState.videoTimestampNotes,
    videoPanelWidth:
      typeof persisted.videoPanelWidth === 'number'
        ? persisted.videoPanelWidth
        : currentState.videoPanelWidth,
    readerPreferences: {
      ...defaultReaderPreferences,
      ...mergedPreferences.readerPreferences,
      theme: normalizeReaderTheme(mergedPreferences.readerPreferences.theme),
      fontFamily: normalizeReaderFont(mergedPreferences.readerPreferences.fontFamily),
      customStyle: normalizeStoredCustomStyle(mergedPreferences.readerPreferences.customStyle),
    },
    readerPreferencesUpdatedAt: mergedPreferences.readerPreferencesUpdatedAt,
    readerStyleUpdatedAt: mergedPreferences.readerStyleUpdatedAt,
    readerLayoutUpdatedAt: mergedPreferences.readerLayoutUpdatedAt,
    aiPreferences: {
      provider: persisted.aiPreferences
        ? persisted.aiPreferences.provider?.startsWith('api:')
          ? persisted.aiPreferences.provider
          : null
        : currentState.aiPreferences.provider,
      model: persisted.aiPreferences?.model ?? currentState.aiPreferences.model,
      assistantPrompt:
        typeof persisted.aiPreferences?.assistantPrompt === 'string'
          ? persisted.aiPreferences.assistantPrompt
          : (currentState.aiPreferences.assistantPrompt ?? defaultAiPreferences.assistantPrompt),
    },
    webSearchConfig: {
      ...defaultWebSearchConfig,
      ...currentState.webSearchConfig,
      ...(persisted.webSearchConfig ?? {}),
    },
  };
}
