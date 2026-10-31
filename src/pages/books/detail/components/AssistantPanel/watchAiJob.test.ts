import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { AiJob } from '../../../../../api/ai/type';
import { watchAiJob } from './watchAiJob';

const api = vi.hoisted(() => ({ watchJob: vi.fn(), getJob: vi.fn() }));
vi.mock('../../../../../api/ai', () => ({ aiApi: api }));
const job: AiJob = {
  id: 'job',
  bookId: 'book',
  conversationId: 'conversation',
  userMessageId: 'user',
  assistantMessageId: 'assistant',
  status: 'running',
  revision: 1,
  content: '',
  dialogueContent: [],
  createdAt: 1,
  updatedAt: 1,
};
let emit: (job: AiJob) => void;
let visibility: 'visible' | 'hidden';
let stop: (() => void) | undefined;
const onJob = vi.fn();
const onError = vi.fn();
beforeEach(() => {
  vi.useFakeTimers();
  visibility = 'visible';
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
  api.watchJob.mockReset().mockImplementation((_id, listener) => {
    emit = listener;
    return new Promise<void>(() => {});
  });
  api.getJob.mockReset().mockResolvedValue(job);
  onJob.mockClear();
  onError.mockClear();
});
afterEach(() => {
  stop?.();
  vi.useRealTimers();
});
it('uses the healthy event stream without a second polling loop', async () => {
  stop = watchAiJob({ jobId: job.id, onJob, onError });
  emit(job);
  await vi.advanceTimersByTimeAsync(10_000);
  expect(onJob).toHaveBeenCalledWith(job);
  expect(api.getJob).not.toHaveBeenCalled();
  emit({ ...job, status: 'completed', revision: 2 });
  await vi.advanceTimersByTimeAsync(60_000);
  expect(api.getJob).not.toHaveBeenCalled();
});
it.each(['failure', 'closed'] as const)(
  'falls back after stream %s and polls no faster than every 5 seconds',
  async (outcome) => {
    if (outcome === 'failure') api.watchJob.mockRejectedValueOnce(new Error('stream unavailable'));
    else api.watchJob.mockResolvedValueOnce(undefined);
    stop = watchAiJob({ jobId: job.id, onJob, onError });
    await vi.advanceTimersByTimeAsync(0);
    expect(api.getJob).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(4_999);
    expect(api.getJob).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(api.getJob).toHaveBeenCalledTimes(2);
  },
);
it('reconnects on returning to the page and never polls while hidden', async () => {
  stop = watchAiJob({ jobId: job.id, onJob, onError });
  const signal = api.watchJob.mock.calls[0][2] as AbortSignal;
  visibility = 'hidden';
  document.dispatchEvent(new Event('visibilitychange'));
  expect(signal.aborted).toBe(true);
  await vi.advanceTimersByTimeAsync(60_000);
  expect(api.getJob).not.toHaveBeenCalled();
  visibility = 'visible';
  document.dispatchEvent(new Event('visibilitychange'));
  expect(api.watchJob).toHaveBeenCalledTimes(2);
  emit({ ...job, status: 'completed', revision: 2 });
  expect(onJob).toHaveBeenCalledWith(expect.objectContaining({ status: 'completed' }));
});
it('recovers a stalled stream once the watchdog expires', async () => {
  stop = watchAiJob({ jobId: job.id, onJob, onError });
  await vi.advanceTimersByTimeAsync(44_999);
  expect(api.getJob).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(api.getJob).toHaveBeenCalledTimes(1);
  emit(job);
  await vi.advanceTimersByTimeAsync(10_000);
  expect(api.getJob).toHaveBeenCalledTimes(1);
});

it('ignores buffered stream updates after fallback has confirmed completion', async () => {
  api.getJob.mockResolvedValueOnce({ ...job, status: 'completed', revision: 5 });
  stop = watchAiJob({ jobId: job.id, onJob, onError });
  await vi.advanceTimersByTimeAsync(45_000);
  emit(job);
  await vi.advanceTimersByTimeAsync(16);
  expect(onJob).toHaveBeenCalledTimes(1);
  expect(onJob).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'completed' }));
});
