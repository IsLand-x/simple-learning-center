export const STATE_DOMAIN_FIELDS = {
  library: ['books', 'bookLists', 'trashedBooks', 'deletedBookTombstones'],
  reading: ['highlights', 'deletedHighlightTombstones', 'notes', 'readingSessions'],
  conversations: ['chats', 'chatSessions'],
  rss: [
    'rssFolders',
    'rssFeeds',
    'rssItems',
    'rssAnnotations',
    'rssDailyDigests',
    'rssDigestRuns',
    'rssDigestSettings',
    'rssPanelWidth',
  ],
  videos: ['videoResources', 'videoTimestampNotes', 'videoPanelWidth'],
  preferences: [
    'openAIConfigs',
    'webSearchConfig',
    'aiPreferences',
    'navCollapsed',
    'themeMode',
    'readerPreferences',
    'readerPreferencesUpdatedAt',
    'readerStyleUpdatedAt',
    'readerLayoutUpdatedAt',
  ],
} as const;

export type StateDomain = keyof typeof STATE_DOMAIN_FIELDS;

export const LEARNING_STORE_VERSION = 31;

export const ALL_STATE_DOMAINS = Object.freeze(Object.keys(STATE_DOMAIN_FIELDS) as StateDomain[]);

export const LIBRARY_STATE_DOMAINS = ['preferences', 'library'] as const;
export const READER_STATE_DOMAINS = ['preferences', 'library', 'reading', 'conversations'] as const;
export const RSS_STATE_DOMAINS = ['preferences', 'rss', 'conversations', 'videos'] as const;
export const VIDEO_STATE_DOMAINS = ['preferences', 'videos', 'reading', 'conversations'] as const;
export const SETTINGS_STATE_DOMAINS = ['preferences'] as const;

export function stateDomainsForPath(pathname: string): readonly StateDomain[] {
  if (pathname.startsWith('/books/')) return READER_STATE_DOMAINS;
  if (pathname.startsWith('/rss')) return RSS_STATE_DOMAINS;
  if (pathname.startsWith('/videos')) return VIDEO_STATE_DOMAINS;
  if (pathname.startsWith('/settings')) return SETTINGS_STATE_DOMAINS;
  return LIBRARY_STATE_DOMAINS;
}
