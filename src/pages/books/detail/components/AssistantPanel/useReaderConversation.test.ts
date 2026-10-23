import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { AiJob } from '../../../../../api/ai/type';
import { useLearningStore } from '../../../../../store/useLearningStore';
import { demoBooks } from '../../../../../util/fixtures/demo';
import { useReaderConversation } from './useReaderConversation';

const mocks = vi.hoisted(() => ({
  startJob: vi.fn(),
  getBookPassages: vi.fn(async () => []),
  waitForServerStateWrites: vi.fn(async () => undefined),
  applyJob: vi.fn(),
  error: vi.fn(),
  setStarting: vi.fn(),
}));
vi.mock('@douyinfe/semi-ui', () => ({ Toast: { error: mocks.error, warning: vi.fn() } }));
vi.mock('../../../../../api/ai/index', () => ({ aiApi: { startJob: mocks.startJob } }));
vi.mock('./bookSearch', () => ({ getBookPassages: mocks.getBookPassages }));
vi.mock('./useReaderConversationJobs', () => ({
  useReaderConversationJobs: () => mocks.applyJob,
}));
vi.mock('./useReaderAiActivity', async () => {
  const { useState, useCallback } = await import('react');
  return {
    useReaderAiJobs: () => {
      const [startingConversations, setStartingConversations] = useState<string[]>([]);
      const setStarting = useCallback((id: string, starting: boolean) => {
        mocks.setStarting(id, starting);
        setStartingConversations((previous) =>
          starting ? [...previous, id] : previous.filter((item) => item !== id),
        );
      }, []);
      return { jobs: [], startingConversations, setStarting, reportJob: vi.fn() };
    },
  };
});
vi.mock('../../../../../components/ai/useConversationMessages', () => ({
  useConversationMessages: () => ({ loading: false, error: '' }),
}));
vi.mock('../../../../../store/serverStateStorage', () => ({
  serverStateStorage: { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() },
  subscribeServerNoteSaves: vi.fn(),
  migrateServerConversations: vi.fn(),
  waitForServerStateWrites: mocks.waitForServerStateWrites,
}));

const book = demoBooks[0];
const question = '请解释这一章';
const quote = { text: '书中原文', chapter: '当前章节' };
const job: AiJob = {
  id: 'job',
  bookId: book.id,
  conversationId: 'conversation',
  userMessageId: 'user',
  assistantMessageId: 'assistant',
  status: 'queued',
  revision: 0,
  content: '',
  dialogueContent: [],
  createdAt: 1,
  updatedAt: 1,
};
let root: Root;
let conversation: ReturnType<typeof useReaderConversation>;
function Probe({ id = 'conversation' }: { id?: string }) {
  conversation = useReaderConversation({
    book,
    conversationId: id,
    getCurrentText: () => '当前正文',
    onClearSelectedText: () => undefined,
  });
  return null;
}
function draft(id = 'conversation') {
  return useLearningStore.getState().conversationDrafts.find((item) => item.conversationId === id)
    ?.text;
}

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.clearAllMocks();
  mocks.startJob.mockResolvedValue(job);
  useLearningStore.setState({
    ...useLearningStore.getInitialState(),
    openAIConfigs: [
      {
        id: 'config',
        name: '测试模型',
        baseUrl: 'https://example.invalid/v1',
        apiKey: '',
        models: ['model'],
        createdAt: 1,
        updatedAt: 1,
      },
    ],
    aiPreferences: {
      ...useLearningStore.getInitialState().aiPreferences,
      provider: 'api:config',
      model: 'model',
    },
    conversationDrafts: [
      { resourceId: book.id, conversationId: 'conversation', text: question, updatedAt: 1 },
    ],
  });
  root = createRoot(document.createElement('div'));
  await act(async () => root.render(createElement(Probe)));
  await act(async () => conversation.setQuote(quote));
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
});

it('keeps the dialogue stable while editing a draft or quote', async () => {
  await act(async () =>
    useLearningStore.setState({
      chats: [
        {
          id: 'history',
          bookId: book.id,
          conversationId: 'conversation',
          role: 'user',
          content: '历史问题',
          createdAt: 1,
        },
      ],
    }),
  );
  const messages = conversation.dialogueMessages;
  await act(async () =>
    useLearningStore.getState().setConversationDraft(book.id, 'conversation', '新的问题'),
  );
  expect(conversation.dialogueMessages).toBe(messages);
  await act(async () => conversation.setQuote(null));
  expect(conversation.dialogueMessages).toBe(messages);
});

it('waits for server acceptance before caching a sent message or clearing its draft and quote', async () => {
  let accept!: (value: AiJob) => void;
  mocks.startJob.mockReturnValueOnce(new Promise<AiJob>((resolve) => (accept = resolve)));
  let sending!: Promise<void>;
  await act(async () => {
    sending = conversation.send(question);
  });
  expect(useLearningStore.getState().chats).toEqual([]);
  expect(useLearningStore.getState().chatSessions).toEqual([]);
  expect(conversation.dialogueMessages).toEqual([]);
  expect(conversation.statusMessage).toContain('正在发送');
  expect(draft()).toBe(question);
  expect(conversation.quote).toEqual(quote);
  await act(async () => {
    accept(job);
    await sending;
  });
  expect(useLearningStore.getState().chats).toEqual([
    expect.objectContaining({ role: 'user', content: question, quote }),
  ]);
  expect(draft()).toBe('');
  expect(conversation.quote).toBeNull();
  expect(mocks.applyJob).toHaveBeenCalledWith(job);
});

it.each(['index', 'state', 'request'] as const)(
  'retains the draft and quote when %s preparation or submission fails, and allows retry',
  async (stage) => {
    const error = new Error('暂时无法连接');
    if (stage === 'index') mocks.getBookPassages.mockRejectedValueOnce(error);
    else if (stage === 'state') mocks.waitForServerStateWrites.mockRejectedValueOnce(error);
    else mocks.startJob.mockRejectedValueOnce(error);
    await act(async () => conversation.send(question));
    expect(useLearningStore.getState().chats).toEqual([]);
    expect(useLearningStore.getState().chatSessions).toEqual([]);
    expect(conversation.dialogueMessages).toEqual([]);
    expect(conversation.status).toBe('error');
    expect(conversation.statusMessage).toContain('发送');
    expect(draft()).toBe(question);
    expect(conversation.quote).toEqual(quote);
    await act(async () => conversation.send(question));
    expect(useLearningStore.getState().chats).toHaveLength(1);
    expect(draft()).toBe('');
  },
);

it('ignores repeated submissions before React renders the pending state', async () => {
  await act(async () => {
    await Promise.all([conversation.send(question), conversation.send(question)]);
  });
  expect(mocks.startJob).toHaveBeenCalledTimes(1);
  expect(useLearningStore.getState().chats).toHaveLength(1);
});

it('preserves newer input while a request is being accepted', async () => {
  let accept!: (value: AiJob) => void;
  mocks.startJob.mockReturnValueOnce(new Promise<AiJob>((resolve) => (accept = resolve)));
  let sending!: Promise<void>;
  await act(async () => {
    sending = conversation.send(question);
  });
  await act(async () =>
    useLearningStore.getState().setConversationDraft(book.id, 'conversation', '新的问题'),
  );
  await act(async () => {
    accept(job);
    await sending;
  });
  expect(draft()).toBe('新的问题');
});

it('does not change another conversation when an earlier submission fails', async () => {
  let reject!: (reason: Error) => void;
  mocks.startJob.mockReturnValueOnce(new Promise<AiJob>((_, fail) => (reject = fail)));
  let sending!: Promise<void>;
  await act(async () => {
    sending = conversation.send(question);
  });
  await act(async () => root.render(createElement(Probe, { id: 'other' })));
  await act(async () => {
    reject(new Error('旧请求失败'));
    await sending;
  });
  expect(conversation.status).toBe('ready');
  expect(conversation.statusMessage).toBe('');
  expect(conversation.dialogueMessages).toEqual([]);
  expect(draft()).toBe(question);
});
