import { beforeEach, expect, it, vi } from 'vitest';
import { createConversationActions } from './conversationActions';
import { useLearningStore } from '../useLearningStore';
import type { LearningState } from '../learningState';
import type { ChatMessage, ChatSessionSummary } from '../../../contracts/ai';

const api = vi.hoisted(() => ({
  list: vi.fn(),
  messages: vi.fn(),
  markRead: vi.fn(async () => undefined),
  update: vi.fn(async () => undefined),
  delete: vi.fn(async () => undefined),
}));
vi.mock('../../api/conversations', () => ({ conversationsApi: api }));
const summary: ChatSessionSummary = {
  id: 'one',
  bookId: 'book',
  title: '对话',
  createdAt: 1,
  updatedAt: 2,
  messageCount: 2,
  unreadCount: 1,
};
const message: ChatMessage = {
  id: 'reply',
  bookId: 'book',
  conversationId: 'one',
  role: 'assistant',
  content: '回答',
  createdAt: 2,
};
function store() {
  let state: LearningState = {
    ...useLearningStore.getInitialState(),
    chats: [] as ChatMessage[],
    chatSessions: [],
    conversationSummaries: [] as ChatSessionSummary[],
  };
  const actions = createConversationActions(
    (update) => {
      state = { ...state, ...(typeof update === 'function' ? update(state) : update) };
    },
    () => state,
  );
  state = { ...state, ...actions };
  return { get: () => state, actions };
}
beforeEach(() => {
  vi.clearAllMocks();
});

it('deduplicates and scopes summary requests without fetching message bodies', async () => {
  api.list
    .mockResolvedValueOnce({ sessions: [summary], nextCursor: 'one' })
    .mockResolvedValueOnce({ sessions: [{ ...summary, id: 'two' }], nextCursor: null });
  const { get, actions } = store();
  await Promise.all([
    actions.loadConversationSummaries('book'),
    actions.loadConversationSummaries('book'),
  ]);
  expect(api.list.mock.calls).toEqual([
    ['book', undefined],
    ['book', 'one'],
  ]);
  expect(get().conversationSummaries).toHaveLength(2);
  expect(get().chats).toEqual([]);
  expect(api.messages).not.toHaveBeenCalled();
});

it('merges only requested pages and preserves newer local read receipts', async () => {
  const { get, actions } = store();
  actions.addChatMessage({ ...message, id: 'other', conversationId: 'other' });
  actions.addChatMessage({ ...message, readAt: 20 });
  api.messages.mockResolvedValue({ session: summary, messages: [message], nextCursor: null });
  await actions.loadConversationMessages('book', 'one');
  expect(get().chats).toHaveLength(2);
  expect(get().chats.find((m) => m.id === 'reply')?.readAt).toBe(20);
  expect(api.markRead).not.toHaveBeenCalled();
});

it('ignores late responses after deleting a conversation', async () => {
  const { get, actions } = store();
  let finish: (page: {
    session: ChatSessionSummary;
    messages: ChatMessage[];
    nextCursor: null;
  }) => void = () => {};
  api.messages.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const loading = actions.loadConversationMessages('book', 'one');
  await actions.deleteChatSession('one');
  finish({ session: summary, messages: [message], nextCursor: null });
  await loading;
  expect(get().chats).toEqual([]);
  expect(get().chatSessions).toEqual([]);
});

it('keeps loaded data when an explicit server deletion fails', async () => {
  const { get, actions } = store();
  actions.addChatMessage(message);
  api.delete.mockRejectedValueOnce(new Error('temporary failure'));
  await expect(actions.deleteChatSession('one')).rejects.toThrow('temporary failure');
  expect(get().chats).toEqual([message]);
});

it('excludes message caches and summary read models from ordinary persistence', () => {
  const state = {
    ...useLearningStore.getInitialState(),
    chats: [message],
    chatSessions: [summary],
    conversationSummaries: [summary],
  };
  const snapshot = useLearningStore.persist.getOptions().partialize!(state);
  expect(snapshot).not.toHaveProperty('chats');
  expect(snapshot).not.toHaveProperty('chatSessions');
  expect(snapshot).not.toHaveProperty('conversationSummaries');
});

it('evicts cached messages when another device deletes a known conversation', async () => {
  const { get, actions } = store();
  api.messages.mockResolvedValueOnce({ session: summary, messages: [message], nextCursor: null });
  await actions.loadConversationMessages('book', 'one');
  api.list.mockResolvedValueOnce({ sessions: [], nextCursor: null });
  await actions.loadConversationSummaries('book');
  expect(get().chatSessions).toEqual([]);
  expect(get().chats).toEqual([]);
});

it('keeps independent drafts and records clearing without creating chat history', () => {
  const { get, actions } = store();
  actions.setConversationDraft('book', 'one', '第一行\n第二行');
  actions.setConversationDraft('book', 'two', '另一对话');
  actions.setConversationDraft('rss:article', 'content', '文章问题');
  expect(get().conversationDrafts).toHaveLength(3);
  expect(get().chats).toEqual([]);
  expect(get().chatSessions).toEqual([]);
  actions.setConversationDraft('book', 'one', '');
  expect(get().conversationDrafts.find((draft) => draft.conversationId === 'one')?.text).toBe('');
  expect(get().conversationDrafts.find((draft) => draft.conversationId === 'two')?.text).toBe(
    '另一对话',
  );
});
