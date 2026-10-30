import type { StateDomain } from '../../contracts/state';
import { expect, it, vi } from 'vitest';
import { LEARNING_STORE_VERSION } from './stateDomains';
import type { StateDomainSnapshot, StateDomainResponse } from '../api/state/type';

const mocks = vi.hoisted(() => ({
  readDomain: vi.fn(),
  migrateConversations: vi.fn(async () => undefined),
  writeDomain: vi.fn<
    (
      domain: StateDomain,
      snapshot: StateDomainSnapshot,
      notesBase?: import('../../contracts/reading').NoteItem[],
    ) => Promise<StateDomainSnapshot | undefined>
  >(async () => undefined),
}));
vi.mock('../api/state', () => ({ stateApi: mocks }));

it('AI submission skips draft-only writes but still waits for model configuration changes', async () => {
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
  const withDraft = {
    ...state,
    conversationDrafts: [
      { resourceId: 'book', conversationId: 'conversation', text: '问题', updatedAt: 1 },
    ],
  };
  let release!: () => void;
  mocks.writeDomain.mockImplementationOnce(
    () => new Promise<undefined>((resolve) => (release = () => resolve(undefined))),
  );
  const draftSave = storage.serverStateStorage.setItem(
    'test',
    JSON.stringify({ version: LEARNING_STORE_VERSION, state: withDraft }),
  );
  await vi.waitFor(() => expect(release).toBeTypeOf('function'));
  await storage.waitForServerStateWrites({ ignoreConversationDrafts: true });
  // The ordinary barrier must still wait for the same pending draft.
  let ordinaryFinished = false;
  const ordinary = storage.waitForServerStateWrites().then(() => (ordinaryFinished = true));
  await Promise.resolve();
  expect(ordinaryFinished).toBe(false);
  release();
  await Promise.all([draftSave, ordinary]);

  mocks.writeDomain.mockImplementationOnce(
    () => new Promise<undefined>((resolve) => (release = () => resolve(undefined))),
  );
  const configSave = storage.serverStateStorage.setItem(
    'test',
    JSON.stringify({
      version: LEARNING_STORE_VERSION,
      state: {
        ...withDraft,
        openAIConfigs: [
          {
            id: 'new-config',
            name: '新配置',
            baseUrl: 'https://example.invalid',
            apiKey: '',
            models: ['test'],
            createdAt: 1,
            updatedAt: 1,
          },
        ],
      },
    }),
  );
  await vi.waitFor(() => expect(mocks.writeDomain).toHaveBeenCalledTimes(2));
  // Even if a later edit restores the acknowledged settings, the active
  // intermediate configuration must finish before AI reads the server state.
  mocks.writeDomain.mockResolvedValue(undefined);
  const reverted = storage.serverStateStorage.setItem(
    'test',
    JSON.stringify({ version: LEARNING_STORE_VERSION, state: withDraft }),
  );
  let ready = false;
  const required = storage
    .waitForServerStateWrites({ ignoreConversationDrafts: true })
    .then(() => (ready = true));
  await Promise.resolve();
  expect(ready).toBe(false);
  release();
  await Promise.all([configSave, reverted, required]);
  expect(ready).toBe(true);
  expect(mocks.writeDomain).toHaveBeenCalledTimes(3);
});

it('coalesces preference drafts behind a slow request instead of queuing every keystroke', async () => {
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
  let release!: () => void;
  mocks.writeDomain.mockImplementationOnce(
    () => new Promise<undefined>((resolve) => (release = () => resolve(undefined))),
  );
  mocks.writeDomain.mockResolvedValue(undefined);
  const saves: Array<Promise<unknown>> = [];
  for (let index = 1; index <= 50; index++) {
    saves.push(
      Promise.resolve(
        storage.serverStateStorage.setItem(
          'test',
          JSON.stringify({
            version: LEARNING_STORE_VERSION,
            state: {
              ...state,
              conversationDrafts: [
                {
                  resourceId: 'book',
                  conversationId: 'conversation',
                  text: '字'.repeat(index),
                  updatedAt: index,
                },
              ],
            },
          }),
        ),
      ),
    );
    if (index === 1) await vi.waitFor(() => expect(mocks.writeDomain).toHaveBeenCalledTimes(1));
  }
  expect(mocks.writeDomain).toHaveBeenCalledTimes(1);
  release();
  await Promise.all(saves);
  expect(mocks.writeDomain).toHaveBeenCalledTimes(2);
  expect(mocks.writeDomain.mock.calls[1][0]).toBe('preferences');
  expect(mocks.writeDomain.mock.calls[1][1]).toMatchObject({
    state: { conversationDrafts: [expect.objectContaining({ text: '字'.repeat(50) })] },
  });
});

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
  expect(result.state.chats).toBeUndefined();
  expect(mocks.readDomain.mock.calls.some(([domain]) => domain === 'conversations')).toBe(false);
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
  await vi.waitFor(() => expect(mocks.readDomain).toHaveBeenCalledTimes(6));
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
  expect(Object.keys(mocks.writeDomain.mock.calls[0][1].state)).toEqual([
    'readingSessions',
    'chapterMindMaps',
    'chapterVideos',
  ]);
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

it('preserves conversation normalization during one-time migration and then discards the full cache', async () => {
  vi.resetModules();
  mocks.readDomain.mockReset();
  mocks.migrateConversations.mockClear();
  window.history.replaceState(null, '', '/books/test');
  const storage = await import('./serverStateStorage');
  const chats = [
    {
      id: 'old',
      bookId: 'test',
      conversationId: 'legacy:test',
      role: 'assistant' as const,
      content: '旧回答',
      createdAt: 1,
      readAt: 1,
    },
  ];
  mocks.readDomain.mockResolvedValue({
    status: 200,
    etag: null,
    snapshot: { version: 32, state: { chats, chatSessions: [] } },
  });
  await storage.prepareServerState();
  await storage.migrateServerConversations({ chats, chatSessions: [] }, 32);
  expect(mocks.migrateConversations).toHaveBeenCalledWith({
    version: LEARNING_STORE_VERSION,
    state: { chats, chatSessions: [] },
  });
  expect(JSON.parse((await storage.serverStateStorage.getItem('test'))!).state).not.toHaveProperty(
    'chats',
  );
  expect(storage.areServerStateDomainsActive(['conversations'])).toBe(false);
});

it.each(['/', '/books/test', '/rss', '/videos'])(
  '打开 %s 或升级旧快照时不请求、不写入停用分区',
  async (pathname) => {
    vi.resetModules();
    mocks.readDomain.mockReset();
    mocks.writeDomain.mockReset();
    window.history.replaceState(null, '', pathname);
    const storage = await import('./serverStateStorage');
    mocks.readDomain.mockResolvedValue({
      status: 200,
      etag: null,
      snapshot: { version: 41, state: { navCollapsed: false } },
    });
    await storage.prepareServerState();
    const requested = mocks.readDomain.mock.calls.map((call) => call[0]);
    expect(requested).not.toContain('rss');
    expect(requested).not.toContain('videos');
    expect(requested).toContain('reading');
    await storage.serverStateStorage.setItem(
      'learning-center-state-v1',
      JSON.stringify({
        version: 42,
        state: {
          navCollapsed: true,
          rssItems: [{ id: 'legacy-rss' }],
          videoResources: [{ id: 'legacy-video' }],
        },
      }),
    );
    const written = mocks.writeDomain.mock.calls.map((call) => call[0]);
    expect(written).toContain('preferences');
    expect(written).not.toContain('rss');
    expect(written).not.toContain('videos');
    expect(
      mocks.writeDomain.mock.calls.every(
        ([, snapshot]) =>
          !Object.hasOwn(snapshot.state, 'rssItems') &&
          !Object.hasOwn(snapshot.state, 'videoResources'),
      ),
    ).toBe(true);
  },
);
