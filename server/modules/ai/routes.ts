import type { AppDependencies } from '../../dependencies.js';
import { createRouter } from '../../http/router.js';
import { streamSSE } from 'hono/streaming';
import { MAX_AI_JOB_REQUEST_BYTES } from '../../config.js';
import { readJsonRequest } from '../../http/body.js';
import { methodNotAllowed, noContent } from '../../http/responses.js';
import { requiredString } from './jobs/model.js';

const AI_STREAM_UPDATE_INTERVAL_MS = 32;

export function createAiRoutes({ aiJobs }: Pick<AppDependencies, 'aiJobs'>) {
  const app = createRouter();
  app.get('/chapter-videos', async (c) =>
    c.json({
      jobs: await aiJobs.listVideoJobs(requiredString(c.req.query('bookId'), '书籍', 200)),
    }),
  );
  app.delete('/chapter-videos/:jobId', async (c) => {
    await aiJobs.deleteVideoJob(
      requiredString(c.req.query('bookId'), '书籍', 200),
      requiredString(c.req.param('jobId'), '任务', 200),
    );
    return noContent(c);
  });
  app.all('/chapter-videos/:jobId', methodNotAllowed);
  app.post('/', async (c) => {
    const payload = await readJsonRequest(c.req.raw, MAX_AI_JOB_REQUEST_BYTES);
    return c.json(await aiJobs.start(payload), 202);
  });
  app.get('/', (c) =>
    c.json({
      jobs: aiJobs
        .list({
          bookId: c.req.query('bookId'),
          conversationId: c.req.query('conversationId'),
        })
        .map((job) => {
          if (c.req.query('view') !== 'summary') return job;
          const {
            content: _content,
            dialogueContent: _dialogue,
            userMessage: _userMessage,
            ...summary
          } = job;
          return summary;
        }),
    }),
  );
  app.get('/:jobId/events', (c) => {
    const jobId = c.req.param('jobId');
    aiJobs.get(jobId);
    c.header('X-Accel-Buffering', 'no');
    return streamSSE(c, async (stream) => {
      type Job = ReturnType<AppDependencies['aiJobs']['get']>;
      let latestJob: Job | undefined;
      let wake: (() => void) | undefined;
      let stopped = false;
      const notify = () => {
        wake?.();
        wake = undefined;
      };
      const unsubscribe = aiJobs.subscribe(jobId, (job: Job) => {
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
            await new Promise<void>((resolve) => {
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
  app.get('/:jobId', (c) => c.json(aiJobs.get(c.req.param('jobId'))));
  app.delete('/:jobId', (c) => c.json(aiJobs.cancel(c.req.param('jobId'))));
  app.all('/', methodNotAllowed);
  app.all('/:jobId', methodNotAllowed);
  return app;
}
