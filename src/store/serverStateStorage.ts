import { measureAsync } from '../util/browser/measureAsync';
import { mergeReadingNotes } from './persistence/noteStateMerge';
import { readingApi } from '../api/reading';
import { booksApi } from '../api/books';
import { ServerApiError } from '../api/http/errors';
import type {
  LearningData,
  PersistedStateEnvelope,
  StateDomain,
  StateDomainSnapshot,
} from '../api/state/type';
import type { BookSearchIndex } from '../api/reading/type';
import type { StateStorage } from 'zustand/middleware';
import type { BookItem } from '../../contracts/books';
import type { NoteItem } from '../../contracts/reading';
import { loadLegacyBookSearchIndex, loadLegacyEpubFile } from './persistence/legacyBrowser';
import { stateApi } from '../api/state';
import {
  ALL_STATE_DOMAINS,
  LEARNING_STORE_VERSION,
  STATE_DOMAIN_FIELDS,
  stateDomainsForPath,
} from './stateDomains';

const STATE_STORAGE_KEY = 'learning-center-state-v1';

let prepared = false;
let preparedEnvelope: PersistedStateEnvelope | null = null;
let preparedState: string | null | undefined;
let stateWriteQueue = Promise.resolve();
const loadedDomains = new Set<StateDomain>();
const activeDomains = new Set<StateDomain>();
const domainEtags = new Map<StateDomain, string>();
const domainPayloads = new Map<StateDomain, string>();
const domainSubmittedPayloads = new Map<StateDomain, string>();
const domainQueuedPayloads = new Map<StateDomain, string>();
const domainLoadPromises = new Map<StateDomain, Promise<void>>();
const domainLocalRevisions = new Map<StateDomain, number>();
const noteSaveListeners = new Set<() => void>();

interface DomainWrite {
  body: string;
  snapshot: StateDomainSnapshot;
  notesBase?: NoteItem[];
  revision: number;
}

let pendingNoteWrite: DomainWrite | undefined;

export function subscribeServerNoteSaves(listener: () => void) {
  noteSaveListeners.add(listener);
  return () => {
    noteSaveListeners.delete(listener);
  };
}

function parseStateEnvelope(rawState: string) {
  try {
    const parsed = JSON.parse(rawState) as PersistedStateEnvelope;
    if (!parsed || typeof parsed !== 'object' || !parsed.state || typeof parsed.state !== 'object')
      throw new Error();
    return parsed;
  } catch {
    throw new Error('服务端学习数据格式不正确');
  }
}

function serializePreparedState() {
  if (!preparedEnvelope) return null;
  return (preparedState ??= JSON.stringify(preparedEnvelope));
}

function preparedStateVersion() {
  return preparedEnvelope?.version ?? 0;
}

function mergePreparedState(snapshot: PersistedStateEnvelope) {
  const current = preparedEnvelope ?? { state: {}, version: 0 };
  preparedEnvelope = {
    state: { ...current.state, ...snapshot.state },
    version: Math.max(current.version ?? 0, snapshot.version ?? 0),
  };
  preparedState = undefined;
}

function stateDomainSnapshot(
  envelope: PersistedStateEnvelope,
  domain: StateDomain,
): StateDomainSnapshot {
  const state: Partial<LearningData> = {};
  const copyField = <Field extends keyof LearningData>(field: Field) => {
    if (envelope.state && Object.hasOwn(envelope.state, field))
      state[field] = envelope.state[field];
  };
  for (const field of STATE_DOMAIN_FIELDS[domain]) copyField(field);
  return {
    state,
    version: Number.isInteger(envelope.version) ? envelope.version! : 0,
  };
}

async function fetchStateDomain(domain: StateDomain) {
  const etag = domainEtags.get(domain);
  const localRevision = domainLocalRevisions.get(domain) ?? 0;
  const response = await measureAsync(`state:${domain}`, () => stateApi.readDomain(domain, etag));
  if (response.status === 304 || response.status === 204) {
    loadedDomains.add(domain);
    return;
  }
  const snapshot = response.snapshot;
  loadedDomains.add(domain);
  if ((domainLocalRevisions.get(domain) ?? 0) !== localRevision) {
    // A progress save during the request must not discard freshly created AI
    // notes. Merge only the versioned note fields; retain other local changes.
    if (domain === 'notes' && preparedEnvelope) {
      const local = preparedEnvelope;
      mergePreparedState({
        version: snapshot.version,
        state: mergeReadingNotes(
          {
            notes: 'notes' in snapshot.state ? snapshot.state.notes : undefined,
            deletedNoteTombstones:
              'deletedNoteTombstones' in snapshot.state
                ? snapshot.state.deletedNoteTombstones
                : undefined,
          },
          local.state ?? {},
        ),
      });
    }
    return;
  }
  const nextEtag = response.etag;
  if (nextEtag) domainEtags.set(domain, nextEtag);
  domainPayloads.set(domain, JSON.stringify(stateDomainSnapshot(snapshot, domain)));
  domainSubmittedPayloads.delete(domain);
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
  return serializePreparedState();
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
  if (data) await booksApi.saveEpubFile(book.id, data);
  const index = await loadLegacyBookSearchIndex<BookSearchIndex>(book.id);
  if (index) await readingApi.saveSearchIndex(book.id, index);
}

async function initializeServerState(rawState: string) {
  try {
    await stateApi.initialize(parseLegacyState(rawState));
  } catch (error) {
    if (!(error instanceof ServerApiError) || error.status !== 409) throw error;
  }
}

function resetDomainCache() {
  preparedEnvelope = null;
  preparedState = undefined;
  pendingNoteWrite = undefined;
  loadedDomains.clear();
  activeDomains.clear();
  domainEtags.clear();
  domainPayloads.clear();
  domainSubmittedPayloads.clear();
  domainQueuedPayloads.clear();
  domainLocalRevisions.clear();
}

export async function prepareServerState(onProgress?: (message: string) => void) {
  if (prepared) return serializePreparedState();
  onProgress?.('正在读取页面数据…');
  const initialDomains = stateDomainsForPath(window.location.pathname);
  await loadStateDomains(initialDomains);
  if (preparedEnvelope) {
    if (preparedStateVersion() < LEARNING_STORE_VERSION) {
      onProgress?.('正在升级学习数据…');
      await loadStateDomains(ALL_STATE_DOMAINS);
    }
    activateServerStateDomains([...loadedDomains]);
    prepared = true;
    return serializePreparedState();
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
    if (preparedStateVersion() < LEARNING_STORE_VERSION) {
      await loadStateDomains(ALL_STATE_DOMAINS);
    }
  }

  activateServerStateDomains([...loadedDomains]);
  prepared = true;
  return serializePreparedState();
}

export const serverStateStorage: StateStorage = {
  getItem: async () => {
    if (!prepared) await prepareServerState();
    return serializePreparedState();
  },
  setItem: async (_name, value) => {
    const envelope = parseStateEnvelope(value);
    const domains = [...activeDomains];
    const domainBodies = new Map<StateDomain, DomainWrite>();
    for (const domain of domains) {
      const snapshot = stateDomainSnapshot(envelope, domain);
      const body = JSON.stringify(snapshot);
      const previous =
        domainQueuedPayloads.get(domain) ??
        domainSubmittedPayloads.get(domain) ??
        domainPayloads.get(domain);
      if (previous === body) {
        // The cache already contains this snapshot. Re-merging unchanged
        // domains would parse and serialize every note once per domain on each
        // keystroke; it can also replace a pending canonical note response.
        continue;
      }
      mergePreparedState(snapshot);
      const revision = (domainLocalRevisions.get(domain) ?? 0) + 1;
      const baseline = domainQueuedPayloads.get(domain) ?? domainPayloads.get(domain);
      const notesBase =
        domain === 'notes'
          ? ((baseline ? parseStateEnvelope(baseline).state?.notes : undefined) ?? [])
          : undefined;
      if (domain === 'notes' && pendingNoteWrite) {
        // Keep one waiting draft behind the active request, retaining the base
        // of the first unsent edit so concurrent AI changes still merge safely.
        pendingNoteWrite.body = body;
        pendingNoteWrite.snapshot = snapshot;
        pendingNoteWrite.revision = revision;
      } else {
        const write = { body, snapshot, notesBase, revision };
        domainBodies.set(domain, write);
        if (domain === 'notes') pendingNoteWrite = write;
      }
      domainQueuedPayloads.set(domain, body);
      domainLocalRevisions.set(domain, (domainLocalRevisions.get(domain) ?? 0) + 1);
    }
    stateWriteQueue = stateWriteQueue
      .catch(() => undefined)
      .then(async () => {
        try {
          for (const [domain, { body, snapshot, notesBase, revision }] of domainBodies) {
            if (domain === 'notes') pendingNoteWrite = undefined;
            const saved = await stateApi.writeDomain(domain, snapshot, notesBase);
            // Compare notes against the last submitted local draft until the
            // store has observed the canonical response, rather than treating
            // an unchanged stale value as a new edit on a progress save.
            domainPayloads.set(domain, saved ? JSON.stringify(saved) : body);
            if (domain === 'notes') domainSubmittedPayloads.set(domain, body);
            if (saved && domain === 'notes' && domainLocalRevisions.get(domain) === revision) {
              mergePreparedState(saved);
              noteSaveListeners.forEach((listener) => listener());
            }
          }
        } finally {
          // An earlier domain can fail before the note request starts. Release
          // that unsent draft too, so subsequent edits can schedule a retry.
          if (pendingNoteWrite === domainBodies.get('notes')) pendingNoteWrite = undefined;
          for (const [domain, { body }] of domainBodies) {
            if (domainQueuedPayloads.get(domain) === body) domainQueuedPayloads.delete(domain);
          }
        }
      });
    await stateWriteQueue;
  },
  removeItem: async () => undefined,
};
