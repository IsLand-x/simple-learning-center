import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { DATA_DIRECTORY } from '../../config.js';
import { atomicWrite, bookPath, exists } from '../../infrastructure/fs/files.js';
import { errorHasCode, statusError } from '../../infrastructure/http/errors.js';
import { mutatePersistedState } from '../state/stateStore.js';
import { libraryState, requireBook } from './catalog.js';

const manifestPath = join(DATA_DIRECTORY, 'book-shares.json');
const tokenSchema = z.string().regex(/^[a-f0-9]{64}$/);
const manifestSchema = z.array(z.object({ bookId: z.string(), token: tokenSchema }));

async function readShares() {
  try {
    return manifestSchema.parse(JSON.parse(await readFile(manifestPath, 'utf8')));
  } catch (error) {
    if (errorHasCode(error, 'ENOENT')) return [];
    throw error;
  }
}

// Called within the state write queue by deletion and sharing operations.
export async function removeBookShare(bookId: string) {
  const shares = await readShares();
  if (shares.some((share) => share.bookId === bookId))
    await atomicWrite(
      manifestPath,
      JSON.stringify(shares.filter((share) => share.bookId !== bookId)),
    );
}

export function createBookShare(bookId: string) {
  return mutatePersistedState(async ({ state }) => {
    requireBook(state, bookId);
    if (!(await exists(bookPath(bookId)))) throw statusError(404, '这本书没有可分享的 EPUB 文件');
    const shares = await readShares();
    let share = shares.find((item) => item.bookId === bookId);
    if (!share) {
      share = { bookId, token: randomBytes(32).toString('hex') };
      shares.push(share);
      await atomicWrite(manifestPath, JSON.stringify(shares));
    }
    return { token: share.token, url: `/share/${share.token}` };
  });
}

export function revokeBookShare(bookId: string) {
  return mutatePersistedState(async ({ state }) => {
    requireBook(state, bookId);
    await removeBookShare(bookId);
  });
}

export async function getBookShare(bookId: string) {
  requireBook(await libraryState(), bookId);
  const share = (await readShares()).find((item) => item.bookId === bookId);
  return share ? { token: share.token, url: `/share/${share.token}` } : null;
}

export async function resolveBookShare(token: string) {
  if (!tokenSchema.safeParse(token).success) throw statusError(404, '分享不存在或已停止');
  const state = await libraryState();
  const share = (await readShares()).find((item) => item.token === token);
  if (!share) throw statusError(404, '分享不存在或已停止');
  const book = requireBook(state, share.bookId);
  if (!(await exists(bookPath(book.id)))) throw statusError(404, '分享不存在或已停止');
  return book;
}
