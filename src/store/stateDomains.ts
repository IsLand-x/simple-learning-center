import type { StateDomain, StateDomainFields } from '../../contracts/state';

export const STATE_DOMAIN_FIELDS = {
  library: ['books', 'bookLists', 'trashedBooks', 'deletedBookTombstones'],
  reading: ['readingSessions', 'chapterMindMaps', 'chapterVideos'],
  notes: ['notes', 'deletedNoteTombstones'],
  highlights: ['highlights', 'deletedHighlightTombstones'],
  conversations: ['chats', 'chatSessions'],
  preferences: [
    'openAIConfigs',
    'webSearchConfig',
    'aiPreferences',
    'conversationDrafts',
    'navCollapsed',
    'themeMode',
    'readerPreferences',
    'readerPreferencesUpdatedAt',
    'readerStyleUpdatedAt',
    'readerLayoutUpdatedAt',
  ],
} as const satisfies StateDomainFields;

export const LEARNING_STORE_VERSION = 42;

export const ALL_STATE_DOMAINS = Object.freeze(Object.keys(STATE_DOMAIN_FIELDS) as StateDomain[]);

export const LIBRARY_STATE_DOMAINS = ['preferences', 'library'] as const;
export const READER_STATE_DOMAINS = [
  'preferences',
  'library',
  'reading',
  'notes',
  'highlights',
] as const;
export const SETTINGS_STATE_DOMAINS = ['preferences'] as const;

export function stateDomainsForPath(pathname: string): readonly StateDomain[] {
  if (pathname.startsWith('/books/')) return READER_STATE_DOMAINS;
  if (pathname.startsWith('/settings')) return SETTINGS_STATE_DOMAINS;
  return LIBRARY_STATE_DOMAINS;
}
