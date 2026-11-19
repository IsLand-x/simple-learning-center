import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import type { AiJob } from '../../../../../api/ai/type';
import { useReaderAiStateSync } from './useReaderAiStateSync';

const mocks = vi.hoisted(() => ({ synchronize: vi.fn() }));
vi.mock('../../../../../store/learningStateSync', () => ({
  synchronizeLearningState: mocks.synchronize,
}));

it('retries failed synchronization even for the same job revision and acknowledges success only once', async () => {
  const root = createRoot(document.createElement('div'));
  let sync: (job: AiJob) => Promise<void> | undefined;
  function Probe() {
    sync = useReaderAiStateSync('book');
    return null;
  }
  const job: AiJob = {
    id: 'job',
    bookId: 'book',
    conversationId: 'conversation',
    userMessageId: 'user',
    assistantMessageId: 'assistant',
    status: 'completed',
    revision: 1,
    discussionsRevision: 1,
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
    await expect(sync!(job)).rejects.toThrow('temporary disconnect');
    await sync!(job);
    expect(mocks.synchronize).toHaveBeenCalledTimes(2);
    expect(mocks.synchronize).toHaveBeenLastCalledWith(['reading']);
    await sync!(job);
    expect(mocks.synchronize).toHaveBeenCalledTimes(2);
    await sync!({ ...job, discussionsRevision: 2 });
    expect(mocks.synchronize).toHaveBeenCalledTimes(3);
    expect(mocks.synchronize).toHaveBeenLastCalledWith(['reading']);
    await sync!({ ...job, bookId: 'other-book', discussionsRevision: 3 });
    expect(mocks.synchronize).toHaveBeenCalledTimes(3);
  } finally {
    await act(async () => root.unmount());
    warning.mockRestore();
  }
});
