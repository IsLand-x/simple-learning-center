import { createHash } from 'node:crypto';
import { statusError } from './errors.mjs';

export const STATE_DOMAIN_FIELDS = Object.freeze({
  library: Object.freeze([
    'books',
    'bookLists',
    'trashedBooks',
    'deletedBookTombstones',
  ]),
  reading: Object.freeze([
    'highlights',
    'deletedHighlightTombstones',
    'notes',
    'readingSessions',
  ]),
  conversations: Object.freeze([
    'chats',
    'chatSessions',
  ]),
  rss: Object.freeze([
    'rssFolders',
    'rssFeeds',
    'rssItems',
    'rssAnnotations',
    'rssDailyDigests',
    'rssDigestRuns',
    'rssDigestSettings',
    'rssPanelWidth',
  ]),
  videos: Object.freeze([
    'videoResources',
    'videoTimestampNotes',
    'videoPanelWidth',
  ]),
  preferences: Object.freeze([
    'openAIConfigs',
    'webSearchConfig',
    'aiPreferences',
    'navCollapsed',
    'themeMode',
    'readerPreferences',
    'readerPreferencesUpdatedAt',
    'readerStyleUpdatedAt',
    'readerLayoutUpdatedAt',
  ]),
});

export const STATE_DOMAINS = Object.freeze(Object.keys(STATE_DOMAIN_FIELDS));

export function isStateDomain(value) {
  return typeof value === 'string' && Object.hasOwn(STATE_DOMAIN_FIELDS, value);
}

export function createStateDomainSnapshot(persistedState, domain) {
  if (!isStateDomain(domain)) throw statusError(404, '状态分区不存在');
  if (!persistedState?.state || typeof persistedState.state !== 'object') return null;
  const state = {};
  for (const field of STATE_DOMAIN_FIELDS[domain]) {
    if (Object.hasOwn(persistedState.state, field)) state[field] = structuredClone(persistedState.state[field]);
  }
  return {
    state,
    version: Number.isInteger(persistedState.version) ? persistedState.version : 0,
  };
}

export function mergeStateDomainSnapshot(currentPersistedState, incomingSnapshot, domain) {
  if (!isStateDomain(domain)) throw statusError(404, '状态分区不存在');
  if (!incomingSnapshot?.state || typeof incomingSnapshot.state !== 'object' || Array.isArray(incomingSnapshot.state)) {
    throw statusError(400, '状态分区数据格式不正确');
  }
  const nextState = currentPersistedState?.state
    ? structuredClone(currentPersistedState)
    : { state: {}, version: 0 };
  for (const field of STATE_DOMAIN_FIELDS[domain]) {
    if (Object.hasOwn(incomingSnapshot.state, field)) {
      nextState.state[field] = structuredClone(incomingSnapshot.state[field]);
    }
  }
  const incomingVersion = Number.isInteger(incomingSnapshot.version) ? incomingSnapshot.version : 0;
  const currentVersion = Number.isInteger(nextState.version) ? nextState.version : 0;
  nextState.version = Math.max(currentVersion, incomingVersion);
  return nextState;
}

export function serializeStateDomainSnapshot(persistedState, domain) {
  const snapshot = createStateDomainSnapshot(persistedState, domain);
  if (!snapshot) return null;
  const body = JSON.stringify(snapshot);
  const digest = createHash('sha256').update(body).digest('base64url');
  return { body, etag: `\"${digest}\"`, snapshot };
}
