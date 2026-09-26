import { errorHasCode } from '../../infrastructure/http/errors.js';
interface TokenFile {
  token?: string | null;
  hash?: string | null;
  updatedAt?: string;
}
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { atomicWrite } from '../../infrastructure/fs/files.js';

const digest = (token: string) => createHash('sha256').update(token).digest();

export function createOpenApiTokenService(path: string) {
  let queue: Promise<unknown> = Promise.resolve();
  async function read(): Promise<TokenFile> {
    try {
      return JSON.parse(await readFile(path, 'utf8'));
    } catch (error) {
      if (errorHasCode(error, 'ENOENT')) return {};
      throw error;
    }
  }
  function update(create: boolean) {
    const operation = queue
      .catch(() => undefined)
      .then(async () => {
        const token = create ? `lc_${randomBytes(32).toString('base64url')}` : undefined;
        const updatedAt = new Date().toISOString();
        await atomicWrite(
          path,
          JSON.stringify({
            token: token ?? null,
            hash: token ? digest(token).toString('hex') : null,
            updatedAt,
          }),
        );
        return { configured: Boolean(token), updatedAt, ...(token ? { token } : {}) };
      });
    queue = operation;
    return operation;
  }
  return {
    async status() {
      await queue.catch(() => undefined);
      const value = await read();
      return { configured: Boolean(value.hash), updatedAt: value.updatedAt ?? null };
    },
    async reveal() {
      await queue.catch(() => undefined);
      const value = await read();
      return { configured: Boolean(value.hash), token: value.token || null };
    },
    rotate: () => update(true),
    revoke: () => update(false),
    async verify(header: string | undefined) {
      const match = /^Bearer (lc_[A-Za-z0-9_-]{43})$/i.exec(header || '');
      if (!match) return false;
      await queue.catch(() => undefined);
      const value = await read();
      if (!value.hash) return false;
      const stored = Buffer.from(value.hash, 'hex');
      return stored.length === 32 && timingSafeEqual(stored, digest(match[1]));
    },
  };
}
