import { expect, it, vi } from 'vitest';
import { LEARNING_STORE_VERSION } from './stateDomains';
import type { StateDomainResponse } from '../api/state/type';

const mocks = vi.hoisted(() => ({ readDomain: vi.fn(), writeDomain: vi.fn(async () => {}) }));
vi.mock('../api/state', () => ({ stateApi: mocks }));

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
  const refreshing = storage.refreshServerState(['reading']);
  await vi.waitFor(() => expect(mocks.readDomain).toHaveBeenCalledTimes(5));
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
