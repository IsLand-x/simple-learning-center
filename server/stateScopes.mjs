import { statusError } from './errors.mjs';

export const CURRENT_STATE_VERSION = 26;

const VALID_SCOPES = new Set(['shell', 'library', 'reader', 'rss', 'videos', 'settings']);

const SCOPE_FIELDS = {
  shell: ['navCollapsed', 'themeMode'],
  library: ['books', 'bookLists', 'trashedBooks', 'deletedBookTombstones'],
  reader: [
    'books',
    'highlights',
    'notes',
    'chats',
    'chatSessions',
    'readingSessions',
    'openAIConfigs',
    'aiPreferences',
    'readerPreferences',
    'themeMode',
  ],
  rss: [
    'rssFolders',
    'rssFeeds',
    'rssItems',
    'rssAnnotations',
    'rssDailyDigests',
    'rssDigestRuns',
    'rssDigestSettings',
    'rssPanelWidth',
    'videoResources',
    'chats',
    'chatSessions',
    'openAIConfigs',
    'aiPreferences',
    'readerPreferences',
  ],
  videos: [
    'videoResources',
    'videoTimestampNotes',
    'videoPanelWidth',
    'notes',
    'chats',
    'chatSessions',
    'openAIConfigs',
    'aiPreferences',
  ],
  settings: ['openAIConfigs', 'webSearchConfig', 'aiPreferences'],
};

const RESOURCE_FIELDS = new Set(['highlights', 'notes', 'chats', 'chatSessions', 'readingSessions']);

function stateArray(state, key) {
  return Array.isArray(state?.[key]) ? state[key] : [];
}

function uniqueStrings(values) {
  return [...new Set(values.filter((value) => typeof value === 'string' && value))];
}

export function parseStateScopeQuery(scopeValue, bookIdValues = []) {
  const scopes = uniqueStrings(String(scopeValue || 'shell').split(',').map((scope) => scope.trim()));
  if (!scopes.length || scopes.some((scope) => !VALID_SCOPES.has(scope))) {
    throw statusError(400, '状态数据作用域不正确');
  }
  const bookIds = uniqueStrings(bookIdValues);
  if (scopes.includes('reader') && !bookIds.length) {
    throw statusError(400, '阅读器状态缺少书籍标识');
  }
  return { scopes, bookIds };
}

function resourceMatches(item, scopes, bookIds) {
  const resourceId = typeof item?.bookId === 'string' ? item.bookId : '';
  return (scopes.includes('reader') && bookIds.includes(resourceId))
    || (scopes.includes('rss') && resourceId.startsWith('rss:'))
    || (scopes.includes('videos') && resourceId.startsWith('video:'));
}

function projectField(key, state, scopes, bookIds) {
  if (key === 'books' && scopes.includes('reader') && !scopes.includes('library')) {
    return stateArray(state, key).filter((book) => bookIds.includes(book?.id));
  }
  if (RESOURCE_FIELDS.has(key)) {
    return stateArray(state, key).filter((item) => resourceMatches(item, scopes, bookIds));
  }
  return structuredClone(state?.[key]);
}

export function projectPersistedState(persistedState, { scopes, bookIds }) {
  if (!persistedState?.state) return persistedState;
  // Versions before the previous release still need the browser migration chain.
  // That one-time compatibility path intentionally returns the complete snapshot.
  if (Number(persistedState.version || 0) < 25) return persistedState;

  const keys = new Set(scopes.flatMap((scope) => SCOPE_FIELDS[scope]));
  const state = {};
  for (const key of keys) state[key] = projectField(key, persistedState.state, scopes, bookIds);
  return {
    version: CURRENT_STATE_VERSION,
    state,
  };
}

function mergeEntities(currentItems, incomingItems, matches) {
  return [
    ...currentItems.filter((item) => !matches(item)),
    ...incomingItems.filter(matches),
  ];
}

function mergeBooks(currentBooks, incomingBooks, replaceAll) {
  if (replaceAll) return incomingBooks;
  const incomingById = new Map(incomingBooks.map((book) => [book?.id, book]));
  return [
    ...currentBooks.map((book) => incomingById.get(book?.id) ?? book),
    ...incomingBooks.filter((book) => !currentBooks.some((current) => current?.id === book?.id)),
  ];
}

export function mergeScopedStatePatch(currentPersistedState, patch) {
  if (!currentPersistedState?.state || !patch?.state || typeof patch.state !== 'object') {
    throw statusError(400, '状态增量数据格式不正确');
  }
  if (!Array.isArray(patch.scopes) || !Array.isArray(patch.bookIds)) {
    throw statusError(400, '状态增量缺少作用域信息');
  }
  const { scopes, bookIds } = parseStateScopeQuery(patch.scopes.join(','), patch.bookIds);
  const allowedKeys = new Set(scopes.flatMap((scope) => SCOPE_FIELDS[scope]));
  const next = structuredClone(currentPersistedState);

  for (const [key, value] of Object.entries(patch.state)) {
    if (!allowedKeys.has(key)) continue;
    if (key === 'books') {
      next.state.books = mergeBooks(
        stateArray(next.state, 'books'),
        (Array.isArray(value) ? value : []).filter((book) => (
          scopes.includes('library') || bookIds.includes(book?.id)
        )),
        scopes.includes('library'),
      );
    } else if (RESOURCE_FIELDS.has(key)) {
      next.state[key] = mergeEntities(
        stateArray(next.state, key),
        Array.isArray(value) ? value : [],
        (item) => resourceMatches(item, scopes, bookIds),
      );
    } else {
      next.state[key] = structuredClone(value);
    }
  }
  next.version = Math.max(
    CURRENT_STATE_VERSION,
    Number(currentPersistedState.version || 0),
    Number(patch.version || 0),
  );
  return next;
}

export function noteHydrationFilter({ scopes, bookIds }) {
  if (scopes.includes('reader') || scopes.includes('videos')) {
    return (note) => (scopes.includes('reader') && bookIds.includes(note?.bookId))
      || (scopes.includes('videos') && String(note?.bookId || '').startsWith('video:'));
  }
  return () => false;
}
