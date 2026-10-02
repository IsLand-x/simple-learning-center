import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import type { AiJob } from '../../../../../api/ai/type';
import { demoBooks } from '../../../../../util/fixtures/demo';
import { useReaderConversationJobs } from './useReaderConversationJobs';

const mocks = vi.hoisted(() => ({ synchronize: vi.fn() }));
vi.mock('../../../../../store/learningStateSync', () => ({
  synchronizeLearningState: mocks.synchronize,
}));
vi.mock('../../../../../api/ai/index', () => ({ aiApi: { listJobs: async () => [] } }));

it('acknowledges note versions only after synchronization succeeds and retries later job updates', async () => {
  const root = createRoot(document.createElement('div'));
  const props: Parameters<typeof useReaderConversationJobs>[0] = {
    book: demoBooks[0],
    conversationId: 'conversation',
    reportJob: vi.fn(),
    trackedJobs: [],
    lastAppliedJobRef: { current: undefined },
    synchronizedNoteRevisionsRef: { current: new Map() },
    noteSyncQueueRef: { current: Promise.resolve() },
    activeJobId: null,
    setActiveJobId: vi.fn(),
    setStreamingAssistant: vi.fn(),
    setStatus: vi.fn(),
    setStatusMessage: vi.fn(),
  };
  let applyJob: ReturnType<typeof useReaderConversationJobs>;
  function Probe() {
    applyJob = useReaderConversationJobs(props);
    return null;
  }
  const job: AiJob = {
    id: 'job',
    bookId: demoBooks[0].id,
    conversationId: 'conversation',
    userMessageId: 'user',
    assistantMessageId: 'assistant',
    status: 'running',
    revision: 1,
    notesRevision: 1,
    content: '',
    dialogueContent: [],
    createdAt: 1,
    updatedAt: 1,
  };
  mocks.synchronize
    .mockRejectedValueOnce(new Error('temporary disconnect'))
    .mockResolvedValue(undefined);
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    await act(async () => root.render(createElement(Probe)));
    applyJob!(job);
    await props.noteSyncQueueRef.current.catch(() => undefined);
    expect(props.synchronizedNoteRevisionsRef.current.has(job.id)).toBe(false);
    applyJob!({ ...job, revision: 2 });
    await props.noteSyncQueueRef.current;
    expect(mocks.synchronize).toHaveBeenCalledTimes(2);
    expect(props.synchronizedNoteRevisionsRef.current.get(job.id)).toBe(1);
    applyJob!({ ...job, revision: 3 });
    await props.noteSyncQueueRef.current;
    expect(mocks.synchronize).toHaveBeenCalledTimes(2);
  } finally {
    await act(async () => root.unmount());
    warning.mockRestore();
  }
});
