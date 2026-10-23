import { act, createElement, Fragment } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import type { AiJobSummary } from '../../../../../api/ai/type';
import { ReaderAiActivityProvider } from './ReaderAiActivityProvider';
import { useReaderAiActivity, useReaderAiJobs } from './useReaderAiActivity';

const mocks = vi.hoisted(() => ({
  state: {
    chats: [],
    conversationSummaries: [],
    chatSessions: [{ id: 'conversation' }],
    loadConversationSummaries: vi.fn(async () => undefined),
  },
  reportJob: undefined as ((job: AiJobSummary) => void) | undefined,
}));
vi.mock('../../../../../store/useLearningStore', () => ({
  useLearningStore: (select: (state: typeof mocks.state) => unknown) => select(mocks.state),
}));
vi.mock('../../../../../components/ai/useConversationSummaries', () => ({
  useConversationSummaries: () => undefined,
}));
vi.mock('./useReaderNoteSync', () => ({ useReaderNoteSync: () => ignoreNotes }));
vi.mock('./useReaderJobPolling', () => ({ useReaderJobPolling: () => undefined }));
function ignoreNotes() {}

it('任务正文每次更新不应重渲染阅读器外层，仅状态改变时通知', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  let renders = 0;
  let status = '';
  function Probe() {
    const activity = useReaderAiActivity();
    renders += 1;
    status = activity.status;
    return null;
  }
  function JobsProbe() {
    mocks.reportJob = useReaderAiJobs().reportJob;
    return null;
  }
  const root = createRoot(document.createElement('div'));
  try {
    await act(async () =>
      root.render(
        createElement(ReaderAiActivityProvider, {
          bookId: 'book',
          children: createElement(Fragment, null, createElement(Probe), createElement(JobsProbe)),
        }),
      ),
    );
    const job: AiJobSummary = {
      id: 'job',
      bookId: 'book',
      conversationId: 'conversation',
      userMessageId: 'user',
      assistantMessageId: 'assistant',
      status: 'running',
      revision: 1,
      createdAt: 1,
      updatedAt: 1,
    };
    await act(async () => mocks.reportJob!(job));
    expect(status).toBe('running');
    const runningRenders = renders;
    for (let revision = 2; revision <= 20; revision += 1) {
      await act(async () => mocks.reportJob!({ ...job, revision, updatedAt: revision }));
    }
    expect(renders).toBe(runningRenders);
    await act(async () => mocks.reportJob!({ ...job, revision: 21, status: 'completed' }));
    expect(status).toBe('idle');
  } finally {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  }
});
