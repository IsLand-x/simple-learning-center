import type { ServerContext } from './router.js';
import { extname } from 'node:path';
import { stat } from 'node:fs/promises';
import { exists, fileResponse } from '../infrastructure/fs/files.js';

const MIME_TYPES = new Map([
  ['.avif', 'image/avif'],
  ['.epub', 'application/epub+zip'],
  ['.gif', 'image/gif'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.webp', 'image/webp'],
]);

export async function storedFileResponse(c: ServerContext, path: string, cacheControl?: string) {
  if (!(await exists(path))) return c.json({ error: '文件不存在' }, 404);
  if (cacheControl) {
    const metadata = await stat(path, { bigint: true });
    const etag = `W/"${metadata.size.toString(16)}-${metadata.mtimeNs.toString(16)}"`;
    c.header('Cache-Control', cacheControl);
    c.header('ETag', etag);
    c.header('Last-Modified', metadata.mtime.toUTCString());
    const validators = c.req
      .header('If-None-Match')
      ?.split(',')
      .map((value) => value.trim());
    if (validators?.some((value) => value === '*' || value.replace(/^W\//, '') === etag.slice(2)))
      return c.body(null, 304);
  }
  const response = await fileResponse(path, c.req.method);
  if (!response) return c.json({ error: '文件不存在' }, 404);
  response.headers.set(
    'Content-Type',
    MIME_TYPES.get(extname(path).toLowerCase()) || 'application/octet-stream',
  );
  if (cacheControl) {
    for (const name of ['Cache-Control', 'ETag', 'Last-Modified'])
      response.headers.set(name, c.res.headers.get(name)!);
  }
  return response;
}
