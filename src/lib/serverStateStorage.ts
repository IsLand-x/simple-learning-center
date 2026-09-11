import type { StateStorage } from 'zustand/middleware';
import type { BookItem } from '../types';
import {
  loadLegacyBookSearchIndex,
  loadLegacyEpubFile,
  saveBookSearchIndex,
  saveEpubFile,
} from './epubStorage';
import { ServerApiError, serverRequest } from './serverApi';
import {
  ALL_STATE_DOMAINS,
  LEARNING_STORE_VERSION,
  STATE_DOMAIN_FIELDS,
  stateDomainsForPath,
  type StateDomain,
} from './stateDomains';

const STATE_STORAGE_KEY = 'learning-center-state-v1';

interface PersistedStateEnvelope {
  state?: Record<string, unknown> & {
    books?: BookItem[];
  };
  version?: number;
}

let prepared = false;
let preparedState: string | null = null;
let stateWriteQueue = Promise.resolve();
const loadedDomains = new Set<StateDomain>();
const activeDomains = new Set<StateDomain>();
const domainEtags = new Map<StateDomain, string>();
const domainPayloads = new Map<StateDomain, string>();
const domainQueuedPayloads = new Map<StateDomain, string>();
const domainLoadPromises = new Map<StateDomain, Promise<void>>();
const domainLocalRevisions = new Map<StateDomain, number>();

function parseStateEnvelope(rawState: string) {
  try {
    const parsed = JSON.parse(rawState) as PersistedStateEnvelope;
    if (!parsed || typeof parsed !== 'object' || !parsed.state || typeof parsed.state !== 'object') throw new Error();
    return parsed;
  } catch {
    throw new Error('服务端学习数据格式不正确');
  }
}

function mergePreparedState(snapshot: PersistedStateEnvelope) {
  const current = preparedState ? parseStateEnvelope(preparedState) : { state: {}, version: 0 };
  preparedState = JSON.stringify({
    state: { ...current.state, ...snapshot.state },
    version: Math.max(current.version ?? 0, snapshot.version ?? 0),
  });
}

function stateDomainSnapshot(envelope: PersistedStateEnvelope, domain: StateDomain) {
  const state: Record<string, unknown> = {};
  for (const field of STATE_DOMAIN_FIELDS[domain]) {
    if (envelope.state && Object.hasOwn(envelope.state, field)) state[field] = envelope.state[field];
  }
  return {
    state,
    version: Number.isInteger(envelope.version) ? envelope.version : 0,
  };
}

async function fetchStateDomain(domain: StateDomain) {
  const etag = domainEtags.get(domain);
  const localRevision = domainLocalRevisions.get(domain) ?? 0;
  const response = await serverRequest(`/api/state/${domain}`, {
    ...(etag ? { headers: { 'If-None-Match': etag } } : {}),
  }, [304]);
  if (response.status === 304 || response.status === 204) {
    loadedDomains.add(domain);
    return;
  }
  const rawState = await response.text();
  const snapshot = parseStateEnvelope(rawState);
  loadedDomains.add(domain);
  if ((domainLocalRevisions.get(domain) ?? 0) !== localRevision) return;
  const nextEtag = response.headers.get('ETag');
  if (nextEtag) domainEtags.set(domain, nextEtag);
  domainPayloads.set(domain, JSON.stringify(stateDomainSnapshot(snapshot, domain)));
  mergePreparedState(snapshot);
}

async function loadStateDomain(domain: StateDomain, force: boolean) {
  const activeLoad = domainLoadPromises.get(domain);
  if (activeLoad) return activeLoad;
  if (!force && loadedDomains.has(domain)) return;
  const promise = fetchStateDomain(domain).finally(() => domainLoadPromises.delete(domain));
  domainLoadPromises.set(domain, promise);
  return promise;
}

async function loadStateDomains(domains: readonly StateDomain[], force = false) {
  await Promise.all([...new Set(domains)].map((domain) => loadStateDomain(domain, force)));
  return preparedState;
}

export async function ensureServerStateDomains(domains: readonly StateDomain[]) {
  await stateWriteQueue.catch(() => undefined);
  return loadStateDomains(domains);
}

export function areServerStateDomainsActive(domains: readonly StateDomain[]) {
  return domains.every((domain) => activeDomains.has(domain));
}

export function activateServerStateDomains(domains: readonly StateDomain[]) {
  domains.forEach((domain) => activeDomains.add(domain));
}

export async function refreshServerState(domains?: readonly StateDomain[]) {
  await stateWriteQueue.catch(() => undefined);
  return loadStateDomains(domains ?? [...loadedDomains], true);
}

export async function waitForServerStateWrites() {
  await stateWriteQueue;
}

function readLegacyBrowserState() {
  try {
    return window.localStorage.getItem(STATE_STORAGE_KEY);
  } catch {
    return null;
  }
}

function parseLegacyState(rawState: string) {
  try {
    const parsed = JSON.parse(rawState) as PersistedStateEnvelope;
    if (!parsed || typeof parsed !== 'object' || !parsed.state) throw new Error();
    return parsed;
  } catch {
    throw new Error('浏览器中的旧版学习数据格式不正确，无法自动迁移');
  }
}

async function uploadLegacyBookData(book: BookItem) {
  if (book.kind !== 'epub') return;
  const data = await loadLegacyEpubFile(book.id);
  if (data) await saveEpubFile(book.id, data);
  const index = await loadLegacyBookSearchIndex<unknown>(book.id);
  if (index) await saveBookSearchIndex(book.id, index);
}

async function initializeServerState(rawState: string) {
  try {
    await serverRequest('/api/state?initialize=1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: rawState,
    });
  } catch (error) {
    if (!(error instanceof ServerApiError) || error.status !== 409) throw error;
  }
}

function resetDomainCache() {
  preparedState = null;
  loadedDomains.clear();
  activeDomains.clear();
  domainEtags.clear();
  domainPayloads.clear();
  domainQueuedPayloads.clear();
  domainLocalRevisions.clear();
}

export async function prepareServerState(onProgress?: (message: string) => void) {
  if (prepared) return preparedState;
  onProgress?.('正在连接本地数据服务…');
  const initialDomains = stateDomainsForPath(window.location.pathname);
  await loadStateDomains(initialDomains);
  if (preparedState) {
    if ((parseStateEnvelope(preparedState).version ?? 0) < LEARNING_STORE_VERSION) {
      onProgress?.('正在升级学习数据…');
      await loadStateDomains(ALL_STATE_DOMAINS);
    }
    activateServerStateDomains([...loadedDomains]);
    prepared = true;
    return preparedState;
  }

  const legacyState = readLegacyBrowserState();
  if (legacyState) {
    const parsed = parseLegacyState(legacyState);
    const books = Array.isArray(parsed.state?.books) ? parsed.state.books : [];
    const epubBooks = books.filter((book) => book.kind === 'epub');
    for (let index = 0; index < epubBooks.length; index += 1) {
      onProgress?.(`正在迁移书籍文件（${index + 1}/${epubBooks.length}）…`);
      try {
        await uploadLegacyBookData(epubBooks[index]);
      } catch (error) {
        console.warn(`未能迁移《${epubBooks[index].title}》的浏览器文件`, error);
      }
    }
    onProgress?.('正在迁移笔记、进度和对话…');
    await initializeServerState(legacyState);
    resetDomainCache();
    await loadStateDomains(initialDomains);
    if ((preparedState ? parseStateEnvelope(preparedState).version ?? 0 : 0) < LEARNING_STORE_VERSION) {
      await loadStateDomains(ALL_STATE_DOMAINS);
    }
  }

  activateServerStateDomains([...loadedDomains]);
  prepared = true;
  return preparedState;
}

export const serverStateStorage: StateStorage = {
  getItem: async () => {
    if (!prepared) await prepareServerState();
    return preparedState;
  },
  setItem: async (_name, value) => {
    const envelope = parseStateEnvelope(value);
    const domains = [...activeDomains];
    const domainBodies = new Map<StateDomain, string>();
    for (const domain of domains) {
      const snapshot = stateDomainSnapshot(envelope, domain);
      const body = JSON.stringify(snapshot);
      mergePreparedState(snapshot);
      if ((domainQueuedPayloads.get(domain) ?? domainPayloads.get(domain)) === body) continue;
      domainBodies.set(domain, body);
      domainQueuedPayloads.set(domain, body);
      domainLocalRevisions.set(domain, (domainLocalRevisions.get(domain) ?? 0) + 1);
    }
    stateWriteQueue = stateWriteQueue.catch(() => undefined).then(async () => {
      for (const [domain, body] of domainBodies) {
        try {
          await serverRequest(`/api/state/${domain}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body,
          });
          domainPayloads.set(domain, body);
        } finally {
          if (domainQueuedPayloads.get(domain) === body) domainQueuedPayloads.delete(domain);
        }
      }
    });
    await stateWriteQueue;
  },
  removeItem: async () => undefined,
};
