import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { atomicWrite } from '../storage.mjs';

const digest = (token) => createHash('sha256').update(token).digest();

export function createOpenApiTokenService(path) {
  let queue = Promise.resolve();
  async function read() {
    try {
      return JSON.parse(await readFile(path, 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') return {};
      throw error;
    }
  }
  function update(create) {
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
    async verify(header) {
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
