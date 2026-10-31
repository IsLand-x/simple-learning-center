import type { StateDomainFields } from '../../../contracts/state.js';
import type { PersistedState } from './types.js';
import { createHash } from 'node:crypto';
import { statusError } from '../../infrastructure/http/errors.js';

const STATE_DOMAIN_FIELDS = Object.freeze({
  library: Object.freeze(['books', 'bookLists', 'trashedBooks', 'deletedBookTombstones'] as const),
  reading: Object.freeze(['readingSessions', 'chapterMindMaps', 'chapterVideos'] as const),
  notes: Object.freeze(['notes', 'deletedNoteTombstones'] as const),
  highlights: Object.freeze(['highlights', 'deletedHighlightTombstones'] as const),
  conversations: Object.freeze(['chats', 'chatSessions'] as const),
  preferences: Object.freeze([
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
  ] as const),
} satisfies StateDomainFields);

export function isStateDomain(value: unknown): value is keyof typeof STATE_DOMAIN_FIELDS {
  return typeof value === 'string' && Object.hasOwn(STATE_DOMAIN_FIELDS, value);
}

export function stateDomainFields(domain: keyof typeof STATE_DOMAIN_FIELDS) {
  return STATE_DOMAIN_FIELDS[domain];
}

export function createStateDomainSnapshot(persistedState: PersistedState | null, domain: string) {
  if (!isStateDomain(domain)) throw statusError(404, '状态分区不存在');
  if (!persistedState?.state || typeof persistedState.state !== 'object') return null;
  const state: Record<string, unknown> = {};
  for (const field of STATE_DOMAIN_FIELDS[domain]) {
    if (Object.hasOwn(persistedState.state, field))
      state[field] = structuredClone(persistedState.state[field]);
  }
  return {
    state,
    version: Number.isInteger(persistedState.version) ? persistedState.version : 0,
  };
}

export function mergeStateDomainSnapshot(
  currentPersistedState: PersistedState | null,
  incomingSnapshot: PersistedState,
  domain: string,
): PersistedState {
  if (!isStateDomain(domain)) throw statusError(404, '状态分区不存在');
  if (
    !incomingSnapshot?.state ||
    typeof incomingSnapshot.state !== 'object' ||
    Array.isArray(incomingSnapshot.state)
  ) {
    throw statusError(400, '状态分区数据格式不正确');
  }
  const nextState = currentPersistedState?.state
    ? structuredClone(currentPersistedState)
    : { state: {}, version: 0 };
  // 白名单已由共享契约校验；动态复制继续使用 unknown 索引以兼容旧快照。
  for (const field of STATE_DOMAIN_FIELDS[domain] as readonly string[]) {
    if (Object.hasOwn(incomingSnapshot.state, field)) {
      nextState.state[field] = structuredClone(incomingSnapshot.state[field]);
    }
  }
  if (domain === 'preferences') {
    const drafts = new Map<
      string,
      NonNullable<PersistedState['state']['conversationDrafts']>[number]
    >();
    for (const draft of [
      ...(currentPersistedState?.state.conversationDrafts ?? []),
      ...(incomingSnapshot.state.conversationDrafts ?? []),
    ]) {
      const key = JSON.stringify([draft.resourceId, draft.conversationId]);
      if ((drafts.get(key)?.updatedAt ?? -1) <= draft.updatedAt) drafts.set(key, draft);
    }
    nextState.state.conversationDrafts = [...drafts.values()].filter(
      (draft) => !currentPersistedState?.deletedConversationIds?.includes(draft.conversationId),
    );
  }
  const incomingVersion = Number.isInteger(incomingSnapshot.version) ? incomingSnapshot.version : 0;
  const currentVersion = Number.isInteger(nextState.version) ? nextState.version : 0;
  nextState.version = Math.max(currentVersion, incomingVersion);
  return nextState;
}

export function serializeStateDomainSnapshot(
  persistedState: PersistedState | null,
  domain: string,
) {
  const snapshot = createStateDomainSnapshot(persistedState, domain);
  if (!snapshot) return null;
  const body = JSON.stringify(snapshot);
  const digest = createHash('sha256').update(body).digest('base64url');
  return { body, etag: `"${digest}"`, snapshot };
}
