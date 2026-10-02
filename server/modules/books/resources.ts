import { randomUUID } from 'node:crypto';
import type { BookItem } from '../../../contracts/books.js';
import type { PersistedState } from '../state/types.js';
import { errorHasCode } from '../../infrastructure/http/errors.js';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { statusError } from '../../infrastructure/http/errors.js';
import { atomicWrite, exists, knowledgeMapDirectoryPath } from '../../infrastructure/fs/files.js';
import { mutatePersistedState, readPersistedState } from '../state/stateStore.js';

const imageIdSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
const titleSchema = z.string().trim().min(1).max(200);
const inputSchema = z.object({ imageId: imageIdSchema, title: titleSchema }).strict();
const resourceSchema = inputSchema.extend({ savedAt: z.number().int().nonnegative() });
const manifestSchema = z.object({ version: z.literal(1), resources: z.array(resourceSchema) });
const manifestPath = (bookId: string) => join(knowledgeMapDirectoryPath(bookId), 'resources.json');

function requireBook(snapshot: PersistedState | null, bookId: string) {
  if (!snapshot?.state?.books?.some((book) => book.id === bookId && !book.deletedAt))
    throw statusError(404, '书籍不存在或已移入回收站');
}

async function readResources(bookId: string) {
  let raw;
  try {
    raw = await readFile(manifestPath(bookId), 'utf8');
  } catch (error) {
    if (errorHasCode(error, 'ENOENT')) return [];
    throw error;
  }
  return manifestSchema.parse(JSON.parse(raw)).resources;
}

function present(bookId: string, resources: Array<z.infer<typeof resourceSchema>>) {
  return resources.map((resource) => ({
    ...resource,
    url: `/api/books/${encodeURIComponent(bookId)}/knowledge-maps/${resource.imageId}`,
  }));
}

export async function listBookResources(bookId: string) {
  requireBook(await readPersistedState({ hydrateNote: () => false }), bookId);
  return present(bookId, await readResources(bookId));
}

export async function saveBookResource(bookId: string, input: unknown) {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) throw statusError(400, '请提供有效的图片标识和标题（最多 200 字）');
  return mutatePersistedState(async (snapshot) => {
    requireBook(snapshot, bookId);
    const { imageId, title } = parsed.data;
    if (!(await exists(join(knowledgeMapDirectoryPath(bookId), `${imageId}.png`))))
      throw statusError(404, '这本书的图片不存在');
    const resources = await readResources(bookId);
    if (!resources.some((item) => item.imageId === imageId)) {
      resources.unshift({ imageId, title, savedAt: Date.now() });
      await atomicWrite(manifestPath(bookId), JSON.stringify({ version: 1, resources }));
    }
    return present(bookId, resources);
  });
}

export async function removeBookResource(bookId: string, imageId: string) {
  if (!imageIdSchema.safeParse(imageId).success) throw statusError(400, '图片标识不正确');
  return mutatePersistedState(async (snapshot) => {
    requireBook(snapshot, bookId);
    const resources = (await readResources(bookId)).filter((item) => item.imageId !== imageId);
    await atomicWrite(manifestPath(bookId), JSON.stringify({ version: 1, resources }));
    return present(bookId, resources);
  });
}

export async function renameBookResource(bookId: string, imageId: string, input: unknown) {
  if (!imageIdSchema.safeParse(imageId).success) throw statusError(400, '图片标识不正确');
  const parsed = z.object({ title: titleSchema }).strict().safeParse(input);
  if (!parsed.success) throw statusError(400, '标题不能为空且最多 200 字');
  return mutatePersistedState(async (snapshot) => {
    requireBook(snapshot, bookId);
    const resources = await readResources(bookId);
    const resource = resources.find((item) => item.imageId === imageId);
    if (!resource) throw statusError(404, '图片尚未收藏或已从资源库移除');
    resource.title = parsed.data.title;
    await atomicWrite(manifestPath(bookId), JSON.stringify({ version: 1, resources }));
    return present(bookId, resources);
  });
}

export async function saveKnowledgeMap(book: BookItem, png: Buffer, signal?: AbortSignal) {
  const id = randomUUID();
  // Serialize existence check and write with book deletion to prevent orphan files.
  await mutatePersistedState(async (snapshot) => {
    signal?.throwIfAborted();
    if (
      !snapshot.state.books?.some(
        (item) => item.id === book.id && item.fileSize === book.fileSize && !item.deletedAt,
      )
    )
      throw new Error('书籍已删除或变更，地图未保存。');
    await atomicWrite(join(knowledgeMapDirectoryPath(book.id), `${id}.png`), png);
  });
  return `/api/books/${encodeURIComponent(book.id)}/knowledge-maps/${id}`;
}
