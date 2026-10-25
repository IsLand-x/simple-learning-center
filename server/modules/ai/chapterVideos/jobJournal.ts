import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import type { ChapterVideoJob } from '../../../../contracts/reading.js';
import { atomicWrite, chapterVideoDirectoryPath } from '../../../infrastructure/fs/files.js';
import { errorHasCode, statusError } from '../../../infrastructure/http/errors.js';
import { readPersistedState } from '../../state/stateStore.js';

const jobSchema = z.object({
  id: z.string().min(1).max(200),
  bookId: z.string().min(1).max(200),
  chapterId: z.string().max(500).optional(),
  chapterTitle: z.string().max(2000),
  model: z.string().max(300),
  status: z.enum(['queued', 'running', 'completed', 'failed', 'cancelled']),
  revision: z.number().int().nonnegative(),
  content: z.string().max(2000),
  error: z.string().max(4000).optional(),
  createdAt: z.number().finite(),
  updatedAt: z.number().finite(),
  completedAt: z.number().finite().optional(),
});
const journalSchema = z.object({ version: z.literal(1), jobs: z.array(jobSchema).max(102) });
const active = (job: ChapterVideoJob) => job.status === 'queued' || job.status === 'running';

export function createChapterVideoJobJournal() {
  const records = new Map<string, ChapterVideoJob[]>();
  let writes: Promise<void> = Promise.resolve();
  const path = (bookId: string) => join(chapterVideoDirectoryPath(bookId), 'jobs.json');
  const save = (bookId: string, jobs: ChapterVideoJob[]) =>
    atomicWrite(path(bookId), JSON.stringify({ version: 1, jobs }));
  const enqueue = <T>(operation: () => Promise<T>): Promise<T> => {
    const next = writes.then(operation);
    writes = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  };
  const bookExists = async (bookId: string) => {
    const state = (
      await readPersistedState({
        fields: ['books', 'trashedBooks'],
        hydrateCovers: false,
        hydrateNote: () => false,
      })
    )?.state;
    return (
      state?.books?.some((book) => book.id === bookId) ||
      state?.trashedBooks?.some((entry) => entry.book.id === bookId)
    );
  };
  const load = async (bookId: string) => {
    const cached = records.get(bookId);
    if (cached) return cached;
    let jobs: ChapterVideoJob[];
    try {
      jobs = journalSchema.parse(JSON.parse(await readFile(path(bookId), 'utf8'))).jobs;
    } catch (error) {
      if (!errorHasCode(error, 'ENOENT'))
        throw new Error('无法读取视频任务记录，请稍后重试', { cause: error });
      jobs = [];
    }
    if (jobs.some((job) => job.bookId !== bookId)) throw new Error('视频任务记录不属于当前书籍');
    const now = Date.now();
    const restored = jobs.map((job): ChapterVideoJob =>
      active(job)
        ? {
            ...job,
            status: 'failed',
            revision: job.revision + 1,
            updatedAt: now,
            completedAt: now,
            error: '应用服务已重启，视频任务已中断，请重新生成。',
          }
        : job,
    );
    if (jobs.some(active)) await save(bookId, restored);
    records.set(bookId, restored);
    return restored;
  };
  return {
    record(job: ChapterVideoJob) {
      // Persist only whitelisted task metadata, never model context or credentials.
      const snapshot = jobSchema.parse(job);
      return enqueue(async () => {
        if (!(await bookExists(snapshot.bookId))) {
          records.delete(snapshot.bookId);
          return;
        }
        const previous = await load(snapshot.bookId);
        const existing = previous.find((entry) => entry.id === snapshot.id);
        if (
          existing &&
          (existing.revision >= snapshot.revision ||
            (existing.status === snapshot.status &&
              existing.content === snapshot.content &&
              existing.error === snapshot.error))
        )
          return;
        const next = [snapshot, ...previous.filter((entry) => entry.id !== snapshot.id)].sort(
          (left, right) => right.createdAt - left.createdAt,
        );
        const retained = [
          ...next.filter(active),
          ...next.filter((entry) => !active(entry)).slice(0, 100),
        ];
        await save(snapshot.bookId, retained);
        if (!(await bookExists(snapshot.bookId))) {
          // Deletion can finish while this independent journal is being written.
          // Recheck after the write so late progress cannot recreate book files.
          await rm(chapterVideoDirectoryPath(snapshot.bookId), { recursive: true, force: true });
          records.delete(snapshot.bookId);
          return;
        }
        records.set(snapshot.bookId, retained);
      });
    },
    list(bookId: string): Promise<ChapterVideoJob[]> {
      return enqueue(async () => {
        if (!(await bookExists(bookId))) {
          records.delete(bookId);
          throw statusError(404, '书籍不存在');
        }
        return structuredClone(await load(bookId)).sort(
          (left, right) => right.createdAt - left.createdAt,
        );
      });
    },
  };
}
