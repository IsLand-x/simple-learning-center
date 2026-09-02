import { createReadStream, createWriteStream } from 'node:fs';
import {
  access,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import {
  BOOK_DIRECTORY,
  DATA_DIRECTORY,
  NOTE_DIRECTORY,
  SEARCH_INDEX_DIRECTORY,
  STATE_FILE,
} from './config.mjs';
import { statusError } from './errors.mjs';

let stateWriteQueue = Promise.resolve();
const RSS_STATE_VERSION = 16;
const RSS_DIGEST_STATE_VERSION = 19;
const RSS_DIGEST_RUN_STATE_VERSION = 20;
const RSS_DIGEST_ALL_ITEMS_STATE_VERSION = 21;
const RSS_SOURCE_STATE_VERSION = 22;
const VIDEO_STATE_VERSION = 18;

export function encodedId(value) {
  if (typeof value !== 'string' || !value || value.length > 200 || value.includes('\0')) {
    throw statusError(400, '资源标识不正确');
  }
  // encodeURIComponent leaves dots untouched. Escaping them prevents special
  // path segments such as `..` from ever reaching join().
  return encodeURIComponent(value).replaceAll('.', '%2E');
}

export function bookPath(bookId) {
  return join(BOOK_DIRECTORY, `${encodedId(bookId)}.epub`);
}

export function searchIndexPath(bookId) {
  return join(SEARCH_INDEX_DIRECTORY, `${encodedId(bookId)}.json`);
}

export function noteDirectoryPath(bookId) {
  return join(NOTE_DIRECTORY, encodedId(bookId));
}

function notePath(bookId, noteId) {
  return join(noteDirectoryPath(bookId), `${encodedId(noteId)}.md`);
}

export async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function initializeDataDirectories() {
  await Promise.all([
    mkdir(BOOK_DIRECTORY, { recursive: true, mode: 0o700 }),
    mkdir(NOTE_DIRECTORY, { recursive: true, mode: 0o700 }),
    mkdir(SEARCH_INDEX_DIRECTORY, { recursive: true, mode: 0o700 }),
  ]);
}

export async function atomicWrite(path, data) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporaryPath = `${path}.${process.pid}.${Date.now()}.tmp`;
  try {
    await writeFile(temporaryPath, data, { mode: 0o600 });
    await rename(temporaryPath, path);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

export async function readRequestBody(request, maxBytes) {
  const declaredSize = Number.parseInt(request.headers.get('content-length') || '0', 10);
  if (Number.isFinite(declaredSize) && declaredSize > maxBytes) {
    throw statusError(413, '请求内容过大');
  }
  if (!request.body) throw statusError(400, '请求内容为空');

  const chunks = [];
  let size = 0;
  for await (const chunk of request.body) {
    size += chunk.byteLength;
    if (size > maxBytes) {
      throw statusError(413, '请求内容过大');
    }
    chunks.push(Buffer.from(chunk));
  }
  if (!size) throw statusError(400, '请求内容为空');
  return Buffer.concat(chunks, size);
}

export async function readJsonRequest(request, maxBytes) {
  const body = await readRequestBody(request, maxBytes);
  try {
    return JSON.parse(body.toString('utf8'));
  } catch {
    throw statusError(400, 'JSON 数据格式不正确');
  }
}

export async function writeRequestToFile(readable, targetPath, maxBytes) {
  await mkdir(dirname(targetPath), { recursive: true, mode: 0o700 });
  const temporaryPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`;
  let size = 0;
  const limiter = new Transform({
    transform(chunk, _encoding, callback) {
      size += chunk.length;
      const error = size > maxBytes ? statusError(413, '上传文件过大') : null;
      callback(error, chunk);
    },
  });
  try {
    await pipeline(readable, limiter, createWriteStream(temporaryPath, { mode: 0o600 }));
    if (!size) throw statusError(400, '上传文件为空');
    await rename(temporaryPath, targetPath);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

function persistedStateNotes(persistedState) {
  const notes = persistedState?.state?.notes;
  return Array.isArray(notes) ? notes : [];
}

async function listMarkdownFiles(directory) {
  if (!await exists(directory)) return [];
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return listMarkdownFiles(path);
    return entry.isFile() && entry.name.endsWith('.md') ? [path] : [];
  }));
  return nested.flat();
}

async function prepareStateForDisk(persistedState) {
  if (!persistedState || typeof persistedState !== 'object' || !persistedState.state) {
    throw statusError(400, '状态数据格式不正确');
  }
  const diskState = structuredClone(persistedState);
  const notes = persistedStateNotes(diskState);
  const expectedNoteFiles = new Set();
  const storedNotes = [];

  for (const note of notes) {
    if (!note || typeof note !== 'object' || typeof note.id !== 'string' || typeof note.bookId !== 'string') {
      continue;
    }
    const path = notePath(note.bookId, note.id);
    const content = typeof note.content === 'string' ? note.content : '';
    expectedNoteFiles.add(resolve(path));
    let existingContent;
    try {
      existingContent = await readFile(path, 'utf8');
    } catch {
      existingContent = undefined;
    }
    if (existingContent !== content) await atomicWrite(path, content);
    const { content: _content, ...metadata } = note;
    storedNotes.push({
      ...metadata,
      contentFile: relative(DATA_DIRECTORY, path).split(sep).join('/'),
    });
  }

  for (const path of await listMarkdownFiles(NOTE_DIRECTORY)) {
    if (!expectedNoteFiles.has(resolve(path))) await rm(path, { force: true });
  }

  diskState.state.notes = storedNotes;
  return diskState;
}

async function hydrateStateFromDisk(diskState) {
  const persistedState = diskState?.formatVersion === 1 ? diskState.persistedState : diskState;
  if (!persistedState || typeof persistedState !== 'object' || !persistedState.state) return null;
  const hydratedState = structuredClone(persistedState);
  hydratedState.state.notes = await Promise.all(persistedStateNotes(hydratedState).map(async (note) => {
    if (!note || typeof note !== 'object') return note;
    const { contentFile, ...metadata } = note;
    if (typeof contentFile !== 'string') return { ...metadata, content: note.content ?? '' };
    const path = resolve(DATA_DIRECTORY, contentFile);
    if (path !== DATA_DIRECTORY && !path.startsWith(`${DATA_DIRECTORY}${sep}`)) {
      return { ...metadata, content: '' };
    }
    try {
      return { ...metadata, content: await readFile(path, 'utf8') };
    } catch {
      return { ...metadata, content: '' };
    }
  }));
  return hydratedState;
}

async function readPersistedStateFromDisk() {
  try {
    const diskState = JSON.parse(await readFile(STATE_FILE, 'utf8'));
    return hydrateStateFromDisk(diskState);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

function protectRssStateFromOlderClient(persistedState, currentPersistedState) {
  const incomingVersion = Number.isInteger(persistedState?.version) ? persistedState.version : 0;
  const currentVersion = Number.isInteger(currentPersistedState?.version) ? currentPersistedState.version : 0;
  if (!persistedState?.state || !currentPersistedState?.state) {
    return persistedState;
  }
  const protectCoreRss = currentVersion >= RSS_STATE_VERSION && incomingVersion < RSS_STATE_VERSION;
  const protectDigests = currentVersion >= RSS_DIGEST_STATE_VERSION && incomingVersion < RSS_DIGEST_STATE_VERSION;
  const protectDigestRuns = currentVersion >= RSS_DIGEST_RUN_STATE_VERSION
    && incomingVersion < RSS_DIGEST_RUN_STATE_VERSION;
  const protectAllItemsDigestSettings = currentVersion >= RSS_DIGEST_ALL_ITEMS_STATE_VERSION
    && incomingVersion < RSS_DIGEST_ALL_ITEMS_STATE_VERSION;
  const protectSources = currentVersion >= RSS_SOURCE_STATE_VERSION && incomingVersion < RSS_SOURCE_STATE_VERSION;
  if (!protectCoreRss && !protectDigests && !protectDigestRuns && !protectAllItemsDigestSettings && !protectSources) {
    return persistedState;
  }
  const protectedState = structuredClone(persistedState);
  protectedState.version = currentVersion;
  if (protectCoreRss || protectSources) {
    protectedState.state.rssFolders = structuredClone(
      Array.isArray(currentPersistedState.state.rssFolders) ? currentPersistedState.state.rssFolders : [],
    );
    protectedState.state.rssFeeds = structuredClone(
      Array.isArray(currentPersistedState.state.rssFeeds) ? currentPersistedState.state.rssFeeds : [],
    );
    protectedState.state.rssItems = structuredClone(
      Array.isArray(currentPersistedState.state.rssItems) ? currentPersistedState.state.rssItems : [],
    );
    protectedState.state.rssAnnotations = structuredClone(
      Array.isArray(currentPersistedState.state.rssAnnotations) ? currentPersistedState.state.rssAnnotations : [],
    );
    protectedState.state.rssPanelWidth = typeof currentPersistedState.state.rssPanelWidth === 'number'
      ? currentPersistedState.state.rssPanelWidth
      : 380;
  }
  if (protectDigests || protectAllItemsDigestSettings) {
    protectedState.state.rssDailyDigests = structuredClone(
      Array.isArray(currentPersistedState.state.rssDailyDigests) ? currentPersistedState.state.rssDailyDigests : [],
    );
    protectedState.state.rssDigestSettings = structuredClone(
      currentPersistedState.state.rssDigestSettings || {},
    );
  }
  if (protectDigestRuns) {
    protectedState.state.rssDigestRuns = structuredClone(
      Array.isArray(currentPersistedState.state.rssDigestRuns) ? currentPersistedState.state.rssDigestRuns : [],
    );
  }
  return protectedState;
}

function protectVideoStateFromOlderClient(persistedState, currentPersistedState) {
  const incomingVersion = Number.isInteger(persistedState?.version) ? persistedState.version : 0;
  const currentVersion = Number.isInteger(currentPersistedState?.version) ? currentPersistedState.version : 0;
  if (
    currentVersion < VIDEO_STATE_VERSION
    || incomingVersion >= VIDEO_STATE_VERSION
    || !persistedState?.state
    || !currentPersistedState?.state
  ) {
    return persistedState;
  }
  const protectedState = structuredClone(persistedState);
  protectedState.version = currentVersion;
  protectedState.state.videoResources = structuredClone(
    Array.isArray(currentPersistedState.state.videoResources) ? currentPersistedState.state.videoResources : [],
  );
  protectedState.state.videoTimestampNotes = structuredClone(
    Array.isArray(currentPersistedState.state.videoTimestampNotes) ? currentPersistedState.state.videoTimestampNotes : [],
  );
  protectedState.state.videoPanelWidth = typeof currentPersistedState.state.videoPanelWidth === 'number'
    ? currentPersistedState.state.videoPanelWidth
    : 400;
  return protectedState;
}

async function persistState(persistedState) {
  const currentPersistedState = await readPersistedStateFromDisk();
  const stateForDisk = await prepareStateForDisk(
    protectVideoStateFromOlderClient(
      protectRssStateFromOlderClient(persistedState, currentPersistedState),
      currentPersistedState,
    ),
  );
  await atomicWrite(STATE_FILE, `${JSON.stringify({
    formatVersion: 1,
    updatedAt: new Date().toISOString(),
    persistedState: stateForDisk,
  }, null, 2)}\n`);
}

export async function readPersistedState() {
  await stateWriteQueue.catch(() => undefined);
  return readPersistedStateFromDisk();
}

export function writePersistedState(persistedState, initializeOnly = false, transform) {
  const operation = stateWriteQueue.catch(() => undefined).then(async () => {
    if (initializeOnly && await exists(STATE_FILE)) {
      throw statusError(409, '服务端已经包含数据');
    }
    const currentPersistedState = transform ? await readPersistedStateFromDisk() : null;
    const nextState = transform
      ? await transform(structuredClone(persistedState), currentPersistedState)
      : persistedState;
    await persistState(nextState);
  });
  stateWriteQueue = operation;
  return operation;
}

export function mutatePersistedState(mutator) {
  const operation = stateWriteQueue.catch(() => undefined).then(async () => {
    const persistedState = await readPersistedStateFromDisk();
    if (!persistedState) {
      throw statusError(409, '服务端尚未初始化，无法修改数据');
    }
    const nextState = structuredClone(persistedState);
    const result = await mutator(nextState);
    await persistState(nextState);
    return result;
  });
  stateWriteQueue = operation.then(() => undefined);
  return operation;
}

export async function fileResponse(path, requestMethod = 'GET') {
  const fileStat = await stat(path);
  if (!fileStat.isFile()) return null;
  const body = requestMethod === 'HEAD'
    ? null
    : Readable.toWeb(createReadStream(path));
  return new Response(body, {
    headers: { 'Content-Length': String(fileStat.size) },
  });
}
