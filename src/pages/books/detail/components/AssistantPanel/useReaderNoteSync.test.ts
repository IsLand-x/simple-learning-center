import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import type { AiJob } from '../../../../../api/ai/type';
import { useReaderNoteSync } from './useReaderNoteSync';

const mocks = vi.hoisted(() => ({ synchronize: vi.fn() }));
vi.mock('../../../../../store/learningStateSync', () => ({
  synchronizeLearningState: mocks.synchronize,
}));

it('retries failed synchronization even for the same job revision and acknowledges successful notes only once', async () => {
  const root = createRoot(document.createElement('div'));
  let sync: ReturnType<typeof useReaderNoteSync>;
  function Probe() {
    sync = useReaderNoteSync('book');
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
    await expect(sync!(job)).rejects.toThrow('temporary disconnect');
    await sync!(job);
    expect(mocks.synchronize).toHaveBeenCalledTimes(2);
    expect(mocks.synchronize).toHaveBeenLastCalledWith(['notes']);
    await sync!(job);
    expect(mocks.synchronize).toHaveBeenCalledTimes(2);
    await sync!({ ...job, notesRevision: 2 });
    expect(mocks.synchronize).toHaveBeenCalledTimes(3);
  } finally {
    await act(async () => root.unmount());
    warning.mockRestore();
  }
});
