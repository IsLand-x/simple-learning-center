import { Worker } from 'node:worker_threads';
import { z } from 'zod';

const resultSchema = z.object({
  png: z.instanceof(Uint8Array),
  width: z.number().int().min(200).max(2000),
  height: z.number().int().min(200).max(2000),
  labels: z.string().max(160_000),
});

export async function renderDiagram(script: string, signal?: AbortSignal) {
  signal?.throwIfAborted();
  return new Promise<{ png: Buffer; width: number; height: number; labels: string }>(
    (resolve, reject) => {
      const worker = new Worker(new URL('./worker.js', import.meta.url), {
        workerData: script,
        execArgv: [],
        resourceLimits: { maxOldGenerationSizeMb: 96, stackSizeMb: 4 },
      });
      const stop = () => {
        clearTimeout(timeout);
        signal?.removeEventListener('abort', abort);
        void worker.terminate();
      };
      const abort = () => {
        stop();
        reject(new DOMException('绘图已取消', 'AbortError'));
      };
      const timeout = setTimeout(() => {
        stop();
        reject(new Error('本地绘图超过 8 秒限制，请简化脚本。'));
      }, 8000);
      worker.once('message', (message: unknown) => {
        stop();
        const result = resultSchema.safeParse(message);
        if (result.success) {
          resolve({ ...result.data, png: Buffer.from(result.data.png) });
        } else {
          const failure = z.object({ error: z.string().max(300) }).safeParse(message);
          reject(new Error(failure.success ? failure.data.error : '本地绘图未返回有效图片。'));
        }
      });
      worker.once('error', () => {
        stop();
        reject(new Error('本地绘图环境不可用，请提供完整脚本并说明限制。'));
      });
      worker.once('exit', (code) => {
        stop();
        reject(new Error(`绘图进程已结束（${code}），未返回图片。`));
      });
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) abort();
    },
  );
}
