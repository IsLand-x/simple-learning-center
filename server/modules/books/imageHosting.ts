import COS from 'cos-nodejs-sdk-v5';
import { createHash } from 'node:crypto';
import { readFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { DATA_DIRECTORY } from '../../config.js';
import { atomicWrite, exists, knowledgeMapDirectoryPath } from '../../infrastructure/fs/files.js';
import { errorHasCode } from '../../infrastructure/http/errors.js';
import { mutatePersistedState } from '../state/stateStore.js';

const configFile = join(DATA_DIRECTORY, 'cos-images.json');
const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const metadataName = new RegExp(`^(${uuid})\\.cos\\.json$`);
const configSchema = z.object({
  enabled: z.literal(true),
  bucket: z.string().regex(/^[a-z0-9][a-z0-9-]{1,49}-[0-9]+$/),
  region: z.string().regex(/^[a-z]+(?:-[a-z0-9]+)+$/),
  prefix: z
    .string()
    .regex(/^[a-z0-9][a-z0-9/_-]*$/)
    .refine((value) => !value.endsWith('/')),
  secretId: z.string().min(1),
  secretKey: z.string().min(1),
  securityToken: z.string().min(1).optional(),
});
const objectSchema = z.object({
  bucket: configSchema.shape.bucket,
  region: configSchema.shape.region,
  key: z.string().regex(new RegExp(`^[a-z0-9][a-z0-9/_-]*/\\d{4}-\\d{2}-\\d{2}/${uuid}\\.png$`)),
});
type HostingConfig = z.infer<typeof configSchema>;
type HostedObject = z.infer<typeof objectSchema>;
export interface ImageHostingResult {
  cosUrl?: string;
  uploadWarning?: string;
}
interface Dependencies {
  configPath?: string;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

async function readConfig(path: string) {
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (errorHasCode(error, 'ENOENT')) return null;
    // Parse errors may contain credential values. Validate outside the catch and
    // report only a fixed message, without exposing input or an exception cause.
  }
  if (z.object({ enabled: z.literal(false) }).safeParse(raw).success) return null;
  const parsed = configSchema.safeParse(raw);
  if (!parsed.success)
    throw new Error('COS 图床配置无效，请检查服务器数据目录中的 cos-images.json。');
  return parsed.data;
}

function objectUrl(object: HostedObject) {
  return `https://${object.bucket}.cos.${object.region}.myqcloud.com/${object.key}`;
}

class CosRequestError extends Error {
  constructor(readonly status: number) {
    super(`COS 请求失败（HTTP ${status}）。`);
  }
}

async function requestObject(
  method: 'PUT' | 'DELETE',
  config: HostingConfig,
  object: HostedObject,
  fetchImpl: typeof fetch,
  png?: Buffer,
  signal?: AbortSignal,
) {
  if (
    object.bucket !== config.bucket ||
    object.region !== config.region ||
    !object.key.startsWith(`${config.prefix}/`)
  )
    throw new Error('COS 图片记录与当前图床配置不匹配，未操作其他存储桶。');
  const url = new URL(objectUrl(object));
  const headers: { [key: string]: string } = { host: url.host };
  if (config.securityToken) headers['x-cos-security-token'] = config.securityToken;
  if (png) {
    headers['content-type'] = 'image/png';
    headers['content-md5'] = createHash('md5').update(png).digest('base64');
    headers['content-disposition'] = 'inline';
    headers['cache-control'] = 'public, max-age=31536000, immutable';
    headers['x-cos-acl'] = 'public-read';
    headers['x-cos-forbid-overwrite'] = 'true';
  }
  headers.authorization = COS.getAuthorization({
    SecretId: config.secretId,
    SecretKey: config.secretKey,
    Method: method,
    Pathname: url.pathname,
    Headers: headers,
    Expires: 300,
  });
  const response = await fetchImpl(url, {
    method,
    headers,
    body: png ? new Uint8Array(png) : undefined,
    redirect: 'error',
    signal: AbortSignal.any([signal ?? new AbortController().signal, AbortSignal.timeout(30_000)]),
  });
  await response.body?.cancel();
  if (!response.ok && !(method === 'DELETE' && response.status === 404))
    throw new CosRequestError(response.status);
}

export async function publishBookImage(
  {
    bookId,
    imageUrl,
    png,
    signal,
  }: { bookId: string; imageUrl: string; png: Buffer; signal?: AbortSignal },
  { configPath = configFile, fetchImpl = fetch, now = () => new Date() }: Dependencies = {},
): Promise<ImageHostingResult> {
  let config: HostingConfig | null = null;
  let object: HostedObject | undefined;
  let attempted = false;
  let registered = false;
  try {
    signal?.throwIfAborted();
    config = await readConfig(configPath);
    if (!config) return {};
    const imageId = imageUrl.match(new RegExp(`/(${uuid})$`))?.[1];
    if (
      !imageId ||
      imageUrl !== `/api/books/${encodeURIComponent(bookId)}/knowledge-maps/${imageId}`
    )
      throw new Error('图片来源无效。');
    if (
      !png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
      png.length > 20 * 1024 * 1024
    )
      throw new Error('图片格式或大小无效。');
    const date = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now());
    object = {
      bucket: config.bucket,
      region: config.region,
      key: `${config.prefix}/${date}/${imageId}.png`,
    };
    attempted = true;
    await requestObject('PUT', config, object, fetchImpl, png, signal);
    await mutatePersistedState(async (snapshot) => {
      signal?.throwIfAborted();
      if (
        !snapshot.state.books?.some((book) => book.id === bookId && !book.deletedAt) ||
        !(await exists(join(knowledgeMapDirectoryPath(bookId), `${imageId}.png`)))
      )
        throw new Error('书籍或本地图片已删除。');
      await atomicWrite(
        join(knowledgeMapDirectoryPath(bookId), `${imageId}.cos.json`),
        JSON.stringify(object),
      );
      registered = true;
    });
    return { cosUrl: objectUrl(object) };
  } catch (error) {
    // A PUT interrupted after sending may still have created an object. Remove it
    // using a fresh timeout, including when the generation signal was cancelled.
    if (
      attempted &&
      !registered &&
      config &&
      object &&
      !(error instanceof CosRequestError && error.status < 500)
    ) {
      try {
        await requestObject('DELETE', config, object, fetchImpl);
      } catch {
        signal?.throwIfAborted();
        return {
          uploadWarning:
            '原图已保存在本地；COS 上传未完成，云端清理也未成功，请检查图床权限与网络。',
        };
      }
    }
    signal?.throwIfAborted();
    return {
      uploadWarning: '原图已保存在本地；COS 上传未完成，请检查服务器图床配置、权限与网络。',
    };
  }
}

export async function removeHostedBookImages(
  bookId: string,
  { configPath = configFile, fetchImpl = fetch }: Dependencies = {},
) {
  const directory = knowledgeMapDirectoryPath(bookId);
  let names: string[];
  try {
    names = await readdir(directory);
  } catch (error) {
    if (errorHasCode(error, 'ENOENT')) return;
    throw error;
  }
  const records = names.filter((name) => metadataName.test(name));
  if (!records.length) return;
  const config = await readConfig(configPath);
  if (!config) throw new Error('无法清理 COS 图片：请恢复服务器图床配置后重试彻底删除。');
  for (const name of records) {
    const object = objectSchema.parse(JSON.parse(await readFile(join(directory, name), 'utf8')));
    // Corrupted records must never delete a different local image's cloud object.
    if (!object.key.endsWith(`/${name.replace('.cos.json', '.png')}`))
      throw new Error('COS 图片记录与本地图片标识不匹配。');
    await requestObject('DELETE', config, object, fetchImpl);
    await rm(join(directory, name));
  }
}
