import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import type { TtsStatus } from '../../../../contracts/ai.js';
import { DATA_DIRECTORY } from '../../../config.js';
import { atomicWrite } from '../../../infrastructure/fs/files.js';
import { errorHasCode, statusError } from '../../../infrastructure/http/errors.js';

const preferencesSchema = z.object({
  provider: z.literal('aliyun').default('aliyun'),
  region: z.enum(['cn-beijing', 'ap-southeast-1']).default('cn-beijing'),
  model: z.enum(['qwen3-tts-flash', 'qwen3-tts-flash-2025-11-27']).default('qwen3-tts-flash'),
  voice: z.enum(['Cherry', 'Serena', 'Ethan', 'Chelsie']).default('Cherry'),
});
const storedSchema = preferencesSchema.extend({
  apiKey: z.string().trim().min(1).max(1000),
  updatedAt: z.number().default(0),
});
export type StoredTtsConfig = z.infer<typeof storedSchema>;
const defaults = preferencesSchema.parse({});

export function createTtsSettings(path = join(DATA_DIRECTORY, 'tts.json')) {
  let queue: Promise<void> = Promise.resolve();
  const readDisk = async (): Promise<StoredTtsConfig | undefined> => {
    try {
      return storedSchema.parse(JSON.parse(await readFile(path, 'utf8')));
    } catch (cause) {
      if (errorHasCode(cause, 'ENOENT')) return undefined;
      throw new Error('无法读取语音配置', { cause });
    }
  };
  const read = async () => {
    await queue;
    return readDisk();
  };
  const publicStatus = (config: StoredTtsConfig | undefined): TtsStatus => ({
    ...defaults,
    ...(config
      ? {
          provider: config.provider,
          region: config.region,
          model: config.model,
          voice: config.voice,
        }
      : {}),
    configured: Boolean(config?.apiKey),
    updatedAt: config?.updatedAt ?? 0,
  });
  return {
    read,
    async status() {
      return publicStatus(await read());
    },
    async save(input: unknown) {
      const parsed = preferencesSchema
        .extend({ apiKey: z.string().trim().max(1000).optional() })
        .safeParse(input);
      if (!parsed.success) throw statusError(400, '语音配置不正确');
      const operation = queue.then(async () => {
        const previous = await readDisk();
        const config = storedSchema.safeParse({
          ...parsed.data,
          apiKey: parsed.data.apiKey || previous?.apiKey,
          updatedAt: Date.now(),
        });
        if (!config.success) throw statusError(400, '请填写百炼 API Key');
        await atomicWrite(path, JSON.stringify({ version: 1, ...config.data }));
        return publicStatus(config.data);
      });
      queue = operation.then(
        () => undefined,
        () => undefined,
      );
      return operation;
    },
    async remove() {
      const operation = queue.then(() => rm(path, { force: true }));
      queue = operation.catch(() => undefined);
      await operation;
      return publicStatus(undefined);
    },
  };
}

export const ttsSettings = createTtsSettings();
