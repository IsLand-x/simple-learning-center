import { streamSSE } from 'hono/streaming';
import { MAX_AI_JOB_REQUEST_BYTES } from '../config.mjs';
import { readJsonRequest } from '../storage.mjs';
import { methodNotAllowed } from '../app/http.mjs';

const AI_STREAM_UPDATE_INTERVAL_MS = 32;

export function registerAiRoutes(app, { aiJobs }) {
  app.post('/api/ai/jobs', async (c) => {
    const payload = await readJsonRequest(c.req.raw, MAX_AI_JOB_REQUEST_BYTES);
    return c.json(await aiJobs.start(payload), 202);
  });
  app.get('/api/ai/jobs', (c) =>
    c.json({
      jobs: aiJobs.list({
        bookId: c.req.query('bookId'),
        conversationId: c.req.query('conversationId'),
      }),
    }),
  );
  app.get('/api/ai/jobs/:jobId/events', (c) => {
    const jobId = c.req.param('jobId');
    aiJobs.get(jobId);
    c.header('X-Accel-Buffering', 'no');
    return streamSSE(c, async (stream) => {
      let latestJob;
      let wake;
      let stopped = false;
      const notify = () => {
        wake?.();
        wake = undefined;
      };
      const unsubscribe = aiJobs.subscribe(jobId, (job) => {
        latestJob = job;
        notify();
      });
      stream.onAbort(() => {
        stopped = true;
        notify();
      });
      try {
        while (!stopped) {
          if (!latestJob) {
            await new Promise((resolve) => {
              wake = resolve;
            });
          }
          const job = latestJob;
          latestJob = undefined;
          if (!job || stopped) continue;
          await stream.writeSSE({
            event: 'job',
            id: String(job.revision),
            data: JSON.stringify(job),
          });
          if (!['queued', 'running'].includes(job.status)) return;
          await stream.sleep(AI_STREAM_UPDATE_INTERVAL_MS);
        }
      } finally {
        unsubscribe();
      }
    });
  });
  app.get('/api/ai/jobs/:jobId', (c) => c.json(aiJobs.get(c.req.param('jobId'))));
  app.delete('/api/ai/jobs/:jobId', (c) => c.json(aiJobs.cancel(c.req.param('jobId'))));
  app.all('/api/ai/jobs', methodNotAllowed);
  app.all('/api/ai/jobs/:jobId', methodNotAllowed);
}
