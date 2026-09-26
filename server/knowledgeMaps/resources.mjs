import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { statusError } from '../errors.mjs';
import {
  atomicWrite,
  exists,
  knowledgeMapDirectoryPath,
  mutatePersistedState,
  readPersistedState,
} from '../storage.mjs';

const imageIdSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
const titleSchema = z.string().trim().min(1).max(200);
const inputSchema = z.object({ imageId: imageIdSchema, title: titleSchema }).strict();
const resourceSchema = inputSchema.extend({ savedAt: z.number().int().nonnegative() });
const manifestSchema = z.object({ version: z.literal(1), resources: z.array(resourceSchema) });
const manifestPath = (bookId) => join(knowledgeMapDirectoryPath(bookId), 'resources.json');

function requireBook(snapshot, bookId) {
  if (!snapshot?.state?.books?.some((book) => book.id === bookId && !book.deletedAt))
    throw statusError(404, '书籍不存在或已移入回收站');
}

async function readResources(bookId) {
  let raw;
  try {
    raw = await readFile(manifestPath(bookId), 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  return manifestSchema.parse(JSON.parse(raw)).resources;
}

function present(bookId, resources) {
  return resources.map((resource) => ({
    ...resource,
    url: `/api/books/${encodeURIComponent(bookId)}/knowledge-maps/${resource.imageId}`,
  }));
}

export async function listBookResources(bookId) {
  requireBook(await readPersistedState({ hydrateNote: () => false }), bookId);
  return present(bookId, await readResources(bookId));
}

export async function saveBookResource(bookId, input) {
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

export async function removeBookResource(bookId, imageId) {
  if (!imageIdSchema.safeParse(imageId).success) throw statusError(400, '图片标识不正确');
  return mutatePersistedState(async (snapshot) => {
    requireBook(snapshot, bookId);
    const resources = (await readResources(bookId)).filter((item) => item.imageId !== imageId);
    await atomicWrite(manifestPath(bookId), JSON.stringify({ version: 1, resources }));
    return present(bookId, resources);
  });
}

export async function renameBookResource(bookId, imageId, input) {
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
