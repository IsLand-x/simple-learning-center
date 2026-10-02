import { expect, it, vi } from 'vitest';
import type { StateDomain, StateDomainSnapshot, StateDomainResponse } from '../api/state/type';

const mocks = vi.hoisted(() => ({
  readDomain: vi.fn(),
  writeDomain: vi.fn<(domain: StateDomain, snapshot: StateDomainSnapshot) => Promise<void>>(
    async () => {},
  ),
}));
vi.mock('../api/state', () => ({ stateApi: mocks }));

it('does not drop freshly created server notes when progress changes during refresh', async () => {
  vi.resetModules();
  window.history.replaceState(null, '', '/books/test');
  const storage = await import('./serverStateStorage');
  mocks.readDomain.mockResolvedValue({
    status: 200,
    etag: null,
    snapshot: { version: 35, state: {} },
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
      version: 35,
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
    snapshot: { version: 35, state: { notes: [note], readingSessions: [] } },
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
    snapshot: { version: 35, state: initialLearningState },
  });
  await storage.prepareServerState();
  const state = structuredClone(initialLearningState);
  await storage.serverStateStorage.setItem('test', JSON.stringify({ version: 35, state }));
  expect(mocks.writeDomain).not.toHaveBeenCalled();
  state.notes = [
    { id: 'note', bookId: 'test', title: '笔记', content: '正文', createdAt: 1, updatedAt: 1 },
  ];
  await storage.serverStateStorage.setItem('test', JSON.stringify({ version: 35, state }));
  expect(mocks.writeDomain.mock.calls.map((call) => call[0])).toEqual(['notes']);
  mocks.writeDomain.mockClear();
  state.readingSessions = [
    { id: 'session', bookId: 'test', startedAt: 1, endedAt: 2, durationMs: 1 },
  ];
  await storage.serverStateStorage.setItem('test', JSON.stringify({ version: 35, state }));
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
  await storage.serverStateStorage.setItem('test', JSON.stringify({ version: 35, state }));
  expect(mocks.writeDomain.mock.calls.map((call) => call[0])).toEqual(['highlights']);
});
