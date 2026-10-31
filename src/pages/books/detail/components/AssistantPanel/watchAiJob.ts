import { aiApi } from '../../../../../api/ai';
import type { AiJob } from '../../../../../api/ai/type';

export function watchAiJob({
  jobId,
  onJob,
  onError,
}: {
  jobId: string;
  onJob: (job: AiJob) => void;
  onError: (error: unknown) => void;
}) {
  let disposed = false;
  let completed = false;
  let disconnect: (() => void) | undefined;
  const connect = () => {
    disconnect?.();
    disconnect = undefined;
    if (disposed || completed || document.visibilityState !== 'visible') return;
    const controller = new AbortController();
    let stopped = false;
    let polling = false;
    let fallback = false;
    let timer = 0;
    let watchdog = 0;
    let frame = 0;
    let latest: AiJob | undefined;
    const apply = (job: AiJob) => {
      completed = job.status !== 'queued' && job.status !== 'running';
      latest = job;
      if (completed) {
        window.clearTimeout(timer);
        window.clearTimeout(watchdog);
        window.cancelAnimationFrame(frame);
        frame = 0;
        onJob(job);
      } else if (!frame) {
        frame = window.requestAnimationFrame(() => {
          frame = 0;
          if (!stopped && latest) onJob(latest);
        });
      }
    };
    const poll = async () => {
      if (stopped || completed || polling || !fallback) return;
      polling = true;
      try {
        const job = await aiApi.getJob(jobId, controller.signal);
        if (stopped || !fallback) return;
        apply(job);
        if (!completed) timer = window.setTimeout(poll, 5_000);
      } catch (error) {
        if (!stopped && fallback) onError(error);
      } finally {
        polling = false;
      }
    };
    const startPolling = () => {
      if (stopped || completed || fallback) return;
      fallback = true;
      window.clearTimeout(watchdog);
      void poll();
    };
    watchdog = window.setTimeout(startPolling, 45_000);
    void aiApi
      .watchJob(
        jobId,
        (job) => {
          if (stopped || completed) return;
          fallback = false;
          window.clearTimeout(timer);
          window.clearTimeout(watchdog);
          apply(job);
          if (!completed) watchdog = window.setTimeout(startPolling, 45_000);
        },
        controller.signal,
      )
      .then(startPolling)
      .catch(() => {
        if (!controller.signal.aborted) startPolling();
      });
    disconnect = () => {
      stopped = true;
      controller.abort();
      window.clearTimeout(timer);
      window.clearTimeout(watchdog);
      window.cancelAnimationFrame(frame);
    };
  };
  connect();
  document.addEventListener('visibilitychange', connect);
  return () => {
    disposed = true;
    disconnect?.();
    document.removeEventListener('visibilitychange', connect);
  };
}
