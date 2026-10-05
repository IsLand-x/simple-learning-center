import { expect, it, vi } from 'vitest';
import { LEARNING_STORE_VERSION } from './stateDomains';
import type { StateDomain, StateDomainSnapshot, StateDomainResponse } from '../api/state/type';

const mocks = vi.hoisted(() => ({
  readDomain: vi.fn(),
  writeDomain: vi.fn<
    (
      domain: StateDomain,
      snapshot: StateDomainSnapshot,
      notesBase?: import('../../contracts/reading').NoteItem[],
    ) => Promise<StateDomainSnapshot | undefined>
  >(async () => undefined),
}));
vi.mock('../api/state', () => ({ stateApi: mocks }));

it('combines startup domains without reparsing an increasingly large prepared envelope', async () => {
  vi.resetModules();
  mocks.readDomain.mockReset();
  window.history.replaceState(null, '', '/books/test');
  const storage = await import('./serverStateStorage');
  mocks.readDomain.mockImplementation(async (domain: StateDomain) => ({
    status: 200,
    etag: null,
    snapshot: {
      version: LEARNING_STORE_VERSION,
      state:
        domain === 'preferences'
          ? { themeMode: 'dark' }
          : domain === 'conversations'
            ? {
                chats: [
                  {
                    id: 'chat',
                    bookId: 'test',
                    role: 'assistant',
                    content: '原创测试文字。'.repeat(10000),
                    createdAt: 1,
                  },
                ],
              }
            : domain === 'notes'
              ? {
                  notes: [
                    {
                      id: 'note',
                      bookId: 'test',
                      title: '原创笔记',
                      content: '原创笔记。'.repeat(10000),
                      createdAt: 1,
                      updatedAt: 1,
                    },
                  ],
                }
              : {},
    },
  }));
  const parse = vi.spyOn(JSON, 'parse');
  const prepared = await storage.prepareServerState();
  expect(parse).not.toHaveBeenCalled();
  const result = JSON.parse(prepared!);
  expect(result.state.themeMode).toBe('dark');
  expect(result.state.chats[0].id).toBe('chat');
  expect(result.state.notes[0].id).toBe('note');
  expect(await storage.serverStateStorage.getItem('test')).toBe(prepared);
});

it('does not drop freshly created server notes when progress changes during refresh', async () => {
  vi.resetModules();
  window.history.replaceState(null, '', '/books/test');
  const storage = await import('./serverStateStorage');
  mocks.readDomain.mockResolvedValue({
    status: 200,
    etag: null,
    snapshot: { version: LEARNING_STORE_VERSION, state: {} },
  });
  await storage.prepareServerState();
  let resolveReading: (response: StateDomainResponse) => void = () => {};
  mocks.readDomain.mockImplementation(
    () =>
      new Promise<StateDomainResponse>((resolve) => {
        resolveReading = resolve;
      }),
  );
  const refreshing = storage.refreshServerState(['notes']);
  await vi.waitFor(() => expect(mocks.readDomain).toHaveBeenCalledTimes(7));
  const sessions = [{ id: 'session', bookId: 'test', startedAt: 1, endedAt: 2, durationMs: 1 }];
  await storage.serverStateStorage.setItem(
    'test',
    JSON.stringify({
      version: LEARNING_STORE_VERSION,
      state: { notes: [], deletedNoteTombstones: [], readingSessions: sessions },
    }),
  );
  const note = {
    id: 'note',
    bookId: 'test',
    title: '笔记',
    content: 'AI 新正文',
    createdAt: 10,
    updatedAt: 10,
  };
  resolveReading({
    status: 200,
    etag: 'server-new',
    snapshot: { version: LEARNING_STORE_VERSION, state: { notes: [note], readingSessions: [] } },
  });
  await refreshing;
  const state = JSON.parse((await storage.serverStateStorage.getItem('test'))!).state;
  expect(state.notes).toEqual([note]);
  expect(state.readingSessions).toEqual(sessions);
});

it('writes only the changed panel domain, keeping note/highlight/progress payloads separate', async () => {
  vi.resetModules();
  mocks.readDomain.mockClear();
  mocks.writeDomain.mockClear();
  window.history.replaceState(null, '', '/books/test');
  const { initialLearningState } = await import('./defaults');
  const storage = await import('./serverStateStorage');
  mocks.readDomain.mockResolvedValue({
    status: 200,
    etag: null,
    snapshot: { version: LEARNING_STORE_VERSION, state: initialLearningState },
  });
  await storage.prepareServerState();
  const state = structuredClone(initialLearningState);
  await storage.serverStateStorage.setItem(
    'test',
    JSON.stringify({ version: LEARNING_STORE_VERSION, state }),
  );
  expect(mocks.writeDomain).not.toHaveBeenCalled();
  state.notes = [
    { id: 'note', bookId: 'test', title: '笔记', content: '正文', createdAt: 1, updatedAt: 1 },
  ];
  await storage.serverStateStorage.setItem(
    'test',
    JSON.stringify({ version: LEARNING_STORE_VERSION, state }),
  );
  expect(mocks.writeDomain.mock.calls.map((call) => call[0])).toEqual(['notes']);
  mocks.writeDomain.mockClear();
  state.readingSessions = [
    { id: 'session', bookId: 'test', startedAt: 1, endedAt: 2, durationMs: 1 },
  ];
  await storage.serverStateStorage.setItem(
    'test',
    JSON.stringify({ version: LEARNING_STORE_VERSION, state }),
  );
  expect(mocks.writeDomain.mock.calls.map((call) => call[0])).toEqual(['reading']);
  expect(Object.keys(mocks.writeDomain.mock.calls[0][1].state)).toEqual(['readingSessions']);
  mocks.writeDomain.mockClear();
  state.highlights = [
    {
      id: 'highlight',
      bookId: 'test',
      text: '正文',
      cfi: 'cfi',
      chapter: '章节',
      createdAt: 1,
      updatedAt: 1,
    },
  ];
  await storage.serverStateStorage.setItem(
    'test',
    JSON.stringify({ version: LEARNING_STORE_VERSION, state }),
  );
  expect(mocks.writeDomain.mock.calls.map((call) => call[0])).toEqual(['highlights']);
});

it('queued note saves carry their own editing base and notify only the latest canonical result', async () => {
  vi.resetModules();
  mocks.readDomain.mockClear();
  mocks.writeDomain.mockReset();
  window.history.replaceState(null, '', '/books/test');
  const { initialLearningState } = await import('./defaults');
  const storage = await import('./serverStateStorage');
  const note = {
    id: 'note',
    bookId: 'test',
    title: '笔记',
    content: '原文',
    createdAt: 1,
    updatedAt: 1,
  };
  const state = { ...structuredClone(initialLearningState), notes: [note] };
  mocks.readDomain.mockResolvedValue({
    status: 200,
    etag: null,
    snapshot: { version: LEARNING_STORE_VERSION, state },
  });
  await storage.prepareServerState();
  let release: (snapshot: StateDomainSnapshot) => void = () => {};
  mocks.writeDomain.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const notification = vi.fn();
  const unsubscribe = storage.subscribeServerNoteSaves(notification);
  const first = { ...note, content: '用户原文', updatedAt: 2 };
  const second = { ...first, content: '用户继续原文', updatedAt: 3 };
  const saveFirst = storage.serverStateStorage.setItem(
    'test',
    JSON.stringify({ version: LEARNING_STORE_VERSION, state: { ...state, notes: [first] } }),
  );
  await vi.waitFor(() => expect(mocks.writeDomain).toHaveBeenCalledTimes(1));
  const saveSecond = storage.serverStateStorage.setItem(
    'test',
    JSON.stringify({ version: LEARNING_STORE_VERSION, state: { ...state, notes: [second] } }),
  );
  const canonical = {
    version: LEARNING_STORE_VERSION,
    state: {
      notes: [{ ...second, content: '用户继续原文\n\nAI', updatedAt: 5 }],
      deletedNoteTombstones: [],
    },
  };
  mocks.writeDomain.mockResolvedValueOnce(canonical);
  release({
    version: LEARNING_STORE_VERSION,
    state: { notes: [{ ...first, content: '用户原文\n\nAI', updatedAt: 4 }] },
  });
  await Promise.all([saveFirst, saveSecond]);
  expect(mocks.writeDomain.mock.calls[0][2]).toEqual([note]);
  expect(mocks.writeDomain.mock.calls[1][2]).toEqual([first]);
  expect(notification).toHaveBeenCalledTimes(1);
  expect(JSON.parse((await storage.serverStateStorage.getItem('test'))!).state.notes).toEqual(
    canonical.state.notes,
  );
  mocks.writeDomain.mockResolvedValue(undefined);
  await storage.serverStateStorage.setItem(
    'test',
    JSON.stringify({
      version: LEARNING_STORE_VERSION,
      state: {
        ...state,
        notes: [second],
        readingSessions: [
          { id: 'progress', bookId: 'test', startedAt: 1, endedAt: 2, durationMs: 1 },
        ],
      },
    }),
  );
  expect(mocks.writeDomain.mock.calls.map((call) => call[0])).toEqual([
    'notes',
    'notes',
    'reading',
  ]);
  expect(JSON.parse((await storage.serverStateStorage.getItem('test'))!).state.notes).toEqual(
    canonical.state.notes,
  );
  await storage.serverStateStorage.setItem(
    'test',
    JSON.stringify({
      version: LEARNING_STORE_VERSION,
      state: {
        ...state,
        notes: [
          { ...canonical.state.notes[0], content: '用户继续原文\n\nAI 再次编辑', updatedAt: 6 },
        ],
      },
    }),
  );
  expect(mocks.writeDomain.mock.calls.at(-1)![2]).toEqual(canonical.state.notes);
  unsubscribe();
});

it('coalesces rapid edits behind a slow save without dropping the editing base or AI additions', async () => {
  vi.resetModules();
  mocks.readDomain.mockReset();
  mocks.writeDomain.mockReset();
  window.history.replaceState(null, '', '/books/test');
  const { initialLearningState } = await import('./defaults');
  const storage = await import('./serverStateStorage');
  const note = {
    id: 'note',
    bookId: 'test',
    title: '笔记',
    content: '原文',
    createdAt: 1,
    updatedAt: 1,
  };
  const state = { ...structuredClone(initialLearningState), notes: [note] };
  mocks.readDomain.mockResolvedValue({
    status: 200,
    etag: null,
    snapshot: { version: LEARNING_STORE_VERSION, state },
  });
  await storage.prepareServerState();
  let release: (snapshot: StateDomainSnapshot) => void = () => {};
  mocks.writeDomain.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const notification = vi.fn();
  const unsubscribe = storage.subscribeServerNoteSaves(notification);
  const saves: Promise<unknown>[] = [];
  const first = { ...note, content: '原文1', updatedAt: 2 };
  const save = (draft: typeof note) =>
    storage.serverStateStorage.setItem(
      'test',
      JSON.stringify({ version: LEARNING_STORE_VERSION, state: { ...state, notes: [draft] } }),
    );
  saves.push(Promise.resolve(save(first)));
  await vi.waitFor(() => expect(mocks.writeDomain).toHaveBeenCalledTimes(1));
  let latest = first;
  for (let index = 2; index <= 50; index++) {
    latest = { ...latest, content: `${latest.content}字`, updatedAt: index + 1 };
    saves.push(Promise.resolve(save(latest)));
  }
  const canonical = {
    version: LEARNING_STORE_VERSION,
    state: { notes: [{ ...latest, content: `${latest.content}\n\nAI 见解`, updatedAt: 100 }] },
  };
  mocks.writeDomain.mockResolvedValue(canonical);
  release({
    version: LEARNING_STORE_VERSION,
    state: { notes: [{ ...first, content: `${first.content}\n\nAI 见解`, updatedAt: 90 }] },
  });
  await Promise.all(saves);
  expect(mocks.writeDomain).toHaveBeenCalledTimes(2);
  expect(mocks.writeDomain.mock.calls[1][1].state).toMatchObject({ notes: [latest] });
  expect(mocks.writeDomain.mock.calls[1][2]).toEqual([first]);
  expect(notification).toHaveBeenCalledTimes(1);
  expect(JSON.parse((await storage.serverStateStorage.getItem('test'))!).state.notes).toEqual(
    canonical.state.notes,
  );
  unsubscribe();
});

it('can save notes after an earlier domain fails before the pending note is submitted', async () => {
  vi.resetModules();
  mocks.readDomain.mockReset();
  mocks.writeDomain.mockReset();
  window.history.replaceState(null, '', '/books/test');
  const { initialLearningState } = await import('./defaults');
  const storage = await import('./serverStateStorage');
  const state = structuredClone(initialLearningState);
  mocks.readDomain.mockResolvedValue({
    status: 200,
    etag: null,
    snapshot: { version: LEARNING_STORE_VERSION, state },
  });
  await storage.prepareServerState();
  const edited = {
    ...state,
    notes: [
      {
        id: 'note',
        bookId: 'test',
        title: '笔记',
        content: '正文',
        createdAt: 1,
        updatedAt: 1,
      },
    ],
    readingSessions: [{ id: 'session', bookId: 'test', startedAt: 1, endedAt: 2, durationMs: 1 }],
  };
  mocks.writeDomain.mockRejectedValueOnce(new Error('disconnected'));
  const envelope = JSON.stringify({ version: LEARNING_STORE_VERSION, state: edited });
  await expect(storage.serverStateStorage.setItem('test', envelope)).rejects.toThrow(
    'disconnected',
  );
  mocks.writeDomain.mockResolvedValue(undefined);
  await storage.serverStateStorage.setItem('test', envelope);
  expect(mocks.writeDomain.mock.calls.map((call) => call[0])).toEqual([
    'reading',
    'reading',
    'notes',
  ]);
  expect(mocks.writeDomain.mock.calls.at(-1)![1].state).toMatchObject({ notes: edited.notes });
});

it('does not reprocess the complete prepared state for unchanged domains on an edit', async () => {
  vi.resetModules();
  mocks.readDomain.mockReset();
  mocks.writeDomain.mockReset();
  mocks.writeDomain.mockResolvedValue(undefined);
  window.history.replaceState(null, '', '/books/test');
  const { initialLearningState } = await import('./defaults');
  const storage = await import('./serverStateStorage');
  const state = {
    ...structuredClone(initialLearningState),
    notes: [
      {
        id: 'note',
        bookId: 'test',
        title: '长笔记',
        content: '长笔记正文。'.repeat(10000),
        createdAt: 1,
        updatedAt: 1,
      },
    ],
  };
  mocks.readDomain.mockResolvedValue({
    status: 200,
    etag: null,
    snapshot: { version: LEARNING_STORE_VERSION, state },
  });
  await storage.prepareServerState();
  const unchanged = JSON.stringify({ version: LEARNING_STORE_VERSION, state });
  const parse = vi.spyOn(JSON, 'parse');
  await storage.serverStateStorage.setItem('test', unchanged);
  // Only the incoming envelope is parsed, rather than the entire cached state
  // being reparsed for every unchanged reader domain.
  expect(parse).toHaveBeenCalledOnce();
  expect(mocks.writeDomain).not.toHaveBeenCalled();
  parse.mockClear();
  const edited = {
    ...state,
    notes: [{ ...state.notes[0], content: `${state.notes[0].content}新增`, updatedAt: 2 }],
  };
  await storage.serverStateStorage.setItem(
    'test',
    JSON.stringify({ version: LEARNING_STORE_VERSION, state: edited }),
  );
  expect(parse).toHaveBeenCalledTimes(2);
  expect(mocks.writeDomain.mock.calls.map((call) => call[0])).toEqual(['notes']);
  expect(JSON.parse((await storage.serverStateStorage.getItem('test'))!).state.notes).toEqual(
    edited.notes,
  );
});
